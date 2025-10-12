"""
CallEval BERT Model - Modal Deployment (FIXED)
Multi-task BERT with separate task heads
"""

import modal
import os
import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer
from huggingface_hub import hf_hub_download

# Create Modal app
app = modal.App("calleval-bert")

# Create image with dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch",
        "transformers",
        "huggingface-hub",
    )
)

# Mount for model cache
model_cache = modal.Volume.from_name("calleval-bert-cache", create_if_missing=True)


class MultiTaskBERTModel(nn.Module):
    """Multi-task BERT model matching training architecture"""
    
    def __init__(self, model_name, task_configs):
        super().__init__()
        self.bert = AutoModel.from_pretrained(model_name)
        self.dropout = nn.Dropout(0.3)
        
        # Task-specific heads (MUST match training!)
        self.task_heads = nn.ModuleDict()
        self.task_configs = task_configs
        
        hidden_size = self.bert.config.hidden_size
        
        for task_name, config in task_configs.items():
            if config['type'] == 'classification':
                if config['num_classes'] == 2:  # Binary classification
                    self.task_heads[task_name] = nn.Sequential(
                        nn.Linear(hidden_size, hidden_size // 2),
                        nn.ReLU(),
                        nn.Dropout(0.2),
                        nn.Linear(hidden_size // 2, 1)  # Single output for binary
                    )
                else:  # Multi-class classification
                    self.task_heads[task_name] = nn.Sequential(
                        nn.Linear(hidden_size, hidden_size // 2),
                        nn.ReLU(),
                        nn.Dropout(0.2),
                        nn.Linear(hidden_size // 2, config['num_classes'])
                    )
            elif config['type'] == 'regression':
                self.task_heads[task_name] = nn.Sequential(
                    nn.Linear(hidden_size, hidden_size // 2),
                    nn.ReLU(),
                    nn.Dropout(0.2),
                    nn.Linear(hidden_size // 2, 1)
                )
    
    def forward(self, input_ids, attention_mask, task_names=None):
        # Get BERT embeddings
        outputs = self.bert(input_ids=input_ids, attention_mask=attention_mask)
        pooled_output = outputs.pooler_output
        pooled_output = self.dropout(pooled_output)
        
        # If specific tasks are provided, only compute those
        if task_names is not None:
            task_outputs = {}
            for task_name in set(task_names):
                if task_name in self.task_heads:
                    task_outputs[task_name] = self.task_heads[task_name](pooled_output)
            return task_outputs
        
        # Otherwise compute all tasks
        task_outputs = {}
        for task_name, head in self.task_heads.items():
            task_outputs[task_name] = head(pooled_output)
        
        return task_outputs


@app.function(
    image=image,
    gpu="T4",
    timeout=300,
    volumes={"/cache": model_cache},
    secrets=[modal.Secret.from_name("huggingface-secret")]
)
def analyze_text_bert(text: str, task: str = "all"):
    """
    Analyze call transcript text using fine-tuned multi-task BERT model
    
    Args:
        text: Transcript text to analyze
        task: Analysis task (ignored for now, returns all tasks)
    
    Returns:
        dict: Analysis results with scores for each task
    """
    print(f"📝 Analyzing text (length: {len(text)} chars)")
    
    # Set cache directory
    os.environ['TRANSFORMERS_CACHE'] = '/cache'
    
    try:
        # Load tokenizer
        print(f"⏳ Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased", cache_dir="/cache")
        
        # Download checkpoint from Hugging Face
        model_repo = "alino-hcdc/calleval-bert"
        checkpoint_files = [
            "best_calleval_bert_model.pth",
            "calleval_bert_model.pth",
            "pytorch_model.bin",
            "model.safetensors"
        ]
        
        checkpoint_path = None
        for filename in checkpoint_files:
            try:
                print(f"⏳ Trying to download: {filename}")
                checkpoint_path = hf_hub_download(
                    repo_id=model_repo,
                    filename=filename,
                    cache_dir="/cache"
                )
                print(f"✓ Found checkpoint: {filename}")
                break
            except Exception as e:
                print(f"⚠️ {filename} not found: {e}")
                continue
        
        if not checkpoint_path:
            raise Exception(f"No model checkpoint found in {model_repo}")
        
        # Load checkpoint
        print(f"⏳ Loading checkpoint...")
        checkpoint = torch.load(checkpoint_path, map_location="cpu")
        
        # Get task configs from checkpoint or use defaults
        if 'task_configs' in checkpoint:
            task_configs = checkpoint['task_configs']
            print(f"✓ Loaded task configs from checkpoint: {list(task_configs.keys())}")
        else:
            # Default task configs (adjust based on your training)
            task_configs = {
                'professional_greeting': {'type': 'classification', 'num_classes': 2},
                'patient_verification': {'type': 'classification', 'num_classes': 2},
                'active_listening': {'type': 'classification', 'num_classes': 2},
                'recaps_correctly': {'type': 'classification', 'num_classes': 2},
                'offers_assistance': {'type': 'classification', 'num_classes': 2},
                'proper_closing': {'type': 'classification', 'num_classes': 2},
            }
            print(f"⚠️ Using default task configs: {list(task_configs.keys())}")
        
        # Initialize model with correct architecture
        model = MultiTaskBERTModel(
            model_name="bert-base-uncased",
            task_configs=task_configs
        )
        
        # Load weights
        print(f"⏳ Loading model weights...")
        if 'model_state_dict' in checkpoint:
            state_dict = checkpoint['model_state_dict']
        elif 'state_dict' in checkpoint:
            state_dict = checkpoint['state_dict']
        else:
            state_dict = checkpoint
        
        # Remove '_orig_mod.' prefix if present (from torch.compile)
        new_state_dict = {}
        for key, value in state_dict.items():
            new_key = key.replace('_orig_mod.', '')
            new_state_dict[new_key] = value
        
        model.load_state_dict(new_state_dict, strict=False)
        
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model.to(device)
        model.eval()
        
        print(f"✓ Model loaded on {device}")
        
        # Tokenize input
        inputs = tokenizer(
            text,
            max_length=512,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )
        
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Run inference
        print("🔍 Running inference...")
        with torch.no_grad():
            # Forward pass - returns dict of task outputs
            task_outputs = model(
                input_ids=inputs['input_ids'],
                attention_mask=inputs['attention_mask']
            )
        
        # Process outputs for each task
        results = {}
        
        for task_name, output in task_outputs.items():
            config = task_configs[task_name]
            
            if config['type'] == 'classification':
                if config['num_classes'] == 2:
                    # Binary classification - apply sigmoid to logit
                    logit = output.squeeze().cpu().item()
                    probability = torch.sigmoid(torch.tensor(logit)).item()
                    
                    results[task_name] = {
                        "score": probability,
                        "prediction": "positive" if probability >= 0.5 else "negative"
                    }
                    
                    print(f"  ✓ {task_name}: {probability:.4f} ({results[task_name]['prediction']})")
                    
                else:
                    # Multi-class classification - apply softmax
                    logits = output.squeeze().cpu()
                    probabilities = torch.softmax(logits, dim=0)
                    predicted_class = torch.argmax(probabilities).item()
                    
                    results[task_name] = {
                        "score": probabilities[predicted_class].item(),
                        "predicted_class": predicted_class,
                        "all_probabilities": probabilities.tolist()
                    }
                    
                    print(f"  ✓ {task_name}: class {predicted_class} ({probabilities[predicted_class]:.4f})")
                    
            elif config['type'] == 'regression':
                # Regression - raw output
                score = output.squeeze().cpu().item()
                results[task_name] = {
                    "score": score
                }
                print(f"  ✓ {task_name}: {score:.4f}")
        
        print(f"✅ Analysis complete!")
        
        return {
            "success": True,
            "predictions": results,
            "task": task
        }
        
    except Exception as e:
        print(f"❌ Error during analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }


@app.local_entrypoint()
def test():
    """Test the BERT function locally"""
    test_texts = [
        "Hi, thank you for calling Sony Family Practice. How can I help you?",
        "Can I have your date of birth and full name please?",
        "I see, let me check that for you.",
    ]
    
    for i, text in enumerate(test_texts):
        print(f"\n{'='*60}")
        print(f"Test {i+1}: {text}")
        print(f"{'='*60}")
        result = analyze_text_bert.remote(text, task="all")
        
        if result["success"]:
            print("\nResults:")
            for metric, data in result["predictions"].items():
                print(f"  {metric}: {data}")
        else:
            print(f"Error: {result['error']}")