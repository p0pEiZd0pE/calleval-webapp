"""
CallEval BERT Model - Modal Deployment
Text-only analysis for call evaluation
"""

import modal
import os

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


@app.function(
    image=image,
    gpu="T4",  # Cheap GPU for BERT
    timeout=300,
    volumes={"/cache": model_cache},
    secrets=[modal.Secret.from_name("huggingface-secret")]  # Optional: if model is private
)
def analyze_text_bert(text: str, task: str = "all"):
    """
    Analyze call transcript text using fine-tuned BERT model
    
    Args:
        text: Transcript text to analyze
        task: Analysis task ("all", "phase", "quality", "sentiment")
    
    Returns:
        dict: Analysis results with scores and predictions
    """
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    from huggingface_hub import hf_hub_download
    
    print(f"📝 Analyzing text (length: {len(text)} chars)")
    
    # Set cache directory
    os.environ['TRANSFORMERS_CACHE'] = '/cache'
    
    try:
        # Load your fine-tuned BERT model from Hugging Face
        model_name = "alino-hcdc/calleval-bert"
        
        print(f"⏳ Loading BERT model: {model_name}")
        tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased", cache_dir="/cache")
        model = AutoModelForSequenceClassification.from_pretrained(
            model_name,
            cache_dir="/cache"
        )
        
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
            outputs = model(**inputs)
            logits = outputs.logits
            probabilities = torch.softmax(logits, dim=-1)
        
        # Extract predictions
        predictions = probabilities.cpu().numpy()[0]
        
        # Map to your specific features
        # Adjust based on your model's output structure
        results = {
            "professional_greeting": float(predictions[0]) if len(predictions) > 0 else 0.0,
            "patient_verification": float(predictions[1]) if len(predictions) > 1 else 0.0,
            "active_listening": float(predictions[2]) if len(predictions) > 2 else 0.0,
            "recaps_correctly": float(predictions[3]) if len(predictions) > 3 else 0.0,
            "offers_assistance": float(predictions[4]) if len(predictions) > 4 else 0.0,
            "proper_closing": float(predictions[5]) if len(predictions) > 5 else 0.0,
        }
        
        print(f"✅ Analysis complete!")
        return {
            "success": True,
            "predictions": results,
            "task": task
        }
        
    except Exception as e:
        print(f"❌ Error during analysis: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }


@app.local_entrypoint()
def test():
    """Test the BERT function locally"""
    test_text = """
    Hi, thank you for calling Sony Family Practice. How can I help you?
    I need to schedule an appointment with Dr. Smith.
    Let me check the availability. Can I have your name and date of birth?
    """
    
    result = analyze_text_bert.remote(test_text, task="all")
    print("\nTest Results:")
    print(result)