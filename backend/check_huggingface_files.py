"""
Check what files are in your Hugging Face model repositories
"""

from huggingface_hub import HfApi

def list_files_in_repo(repo_id):
    """List all files in a Hugging Face repository"""
    api = HfApi()
    
    try:
        files = api.list_repo_files(repo_id)
        print(f"\n📦 Files in {repo_id}:")
        print("=" * 60)
        for file in files:
            print(f"  - {file}")
        print("=" * 60)
        return files
    except Exception as e:
        print(f"❌ Error accessing {repo_id}: {e}")
        return []

if __name__ == "__main__":
    # Check BERT model
    bert_files = list_files_in_repo("alino-hcdc/calleval-bert")
    
    # Check Wav2Vec2-BERT model
    wav2vec2_files = list_files_in_repo("alino-hcdc/calleval-wav2vec2-bert")
    
    # Check if standard files exist
    print("\n🔍 Analysis:")
    print("=" * 60)
    
    bert_has_standard = any(f in bert_files for f in [
        'pytorch_model.bin', 'model.safetensors', 'tf_model.h5'
    ])
    wav2vec2_has_standard = any(f in wav2vec2_files for f in [
        'pytorch_model.bin', 'model.safetensors', 'tf_model.h5'
    ])
    
    if bert_has_standard:
        print("✅ calleval-bert has standard Hugging Face model files")
    else:
        print("⚠️  calleval-bert is missing standard model files")
        print("   Looking for: pytorch_model.bin, model.safetensors, or tf_model.h5")
        if bert_files:
            print(f"   Found: {', '.join(bert_files)}")
    
    print()
    
    if wav2vec2_has_standard:
        print("✅ calleval-wav2vec2-bert has standard Hugging Face model files")
    else:
        print("⚠️  calleval-wav2vec2-bert is missing standard model files")
        print("   Looking for: pytorch_model.bin, model.safetensors, or tf_model.h5")
        if wav2vec2_files:
            print(f"   Found: {', '.join(wav2vec2_files)}")
    
    print("=" * 60)