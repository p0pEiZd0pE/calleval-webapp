"""
Check Modal function deployments
"""
import modal

def check_function(app_name, function_name):
    """Check if a Modal function exists and is accessible"""
    try:
        print(f"\n🔍 Checking: {app_name}/{function_name}")
        f = modal.Function.from_name(app_name, function_name)
        print(f"  ✅ Function found: {f}")
        return True
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("MODAL FUNCTION DEPLOYMENT CHECK")
    print("=" * 60)
    
    functions = [
        ("whisperx-calleval", "transcribe_with_diarization"),
        ("calleval-bert", "analyze_text_bert"),
        ("calleval-wav2vec2", "analyze_audio_wav2vec2"),
    ]
    
    results = []
    for app_name, func_name in functions:
        result = check_function(app_name, func_name)
        results.append((app_name, func_name, result))
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    all_good = True
    for app_name, func_name, result in results:
        status = "✅ OK" if result else "❌ MISSING"
        print(f"{status} - {app_name}/{func_name}")
        if not result:
            all_good = False
    
    if all_good:
        print("\n🎉 All Modal functions are deployed and accessible!")
    else:
        print("\n⚠️  Some functions are missing. Please redeploy them.")
        print("\nTo redeploy:")
        print("  modal deploy calleval_bert_modal.py")
        print("  modal deploy calleval_wav2vec2_modal.py")