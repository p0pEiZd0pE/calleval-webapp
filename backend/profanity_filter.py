"""
Profanity Filter Utility for CallEval System
This module censors profane words in transcription text
"""

import re
from typing import List, Dict

# Comprehensive list of profanities to censor
PROFANITY_LIST = [
    # Common profanities
    "fuck", "shit", "damn", "bitch", "ass", "asshole", "bastard",
    "crap", "piss", "cock", "dick", "pussy", "cunt", "whore",
    "slut", "fag", "nigger", "nigga", "retard", "motherfucker",
    "goddamn", "bullshit", "dumbass", "jackass", "douche",
    
    # Variations and derivatives
    "fucked", "fucking", "fucker", "fucks", "fuckin",
    "shitty", "shitting", "shitted", "shits",
    "damned", "dammit", "damnit",
    "bitches", "bitchy", "bitchin",
    "asses", "assing",
    "bastards",
    "crappy", "crapping",
    "pissed", "pissing",
    "dicks", "dickhead",
    "cunts",
    "sluts", "slutty",
    "motherfuckers", "motherfuckin",
    
    # Leetspeak and common misspellings
    "fck", "fuk", "fvck", "sh1t", "sht", "b1tch", "btch",
    "a$$", "a55", "azz", "d1ck", "dik", "c0ck",
    
    # Add more as needed based on your healthcare context
]


def censor_profanity(text: str, censor_char: str = "*") -> str:
    """
    Censor profanity in text by replacing with asterisks
    
    Args:
        text: Input text to censor
        censor_char: Character to use for censoring (default: *)
    
    Returns:
        Censored text with profanities replaced
    """
    if not text:
        return text
    
    censored_text = text
    
    # Create regex pattern for case-insensitive matching with word boundaries
    for profanity in PROFANITY_LIST:
        # Use word boundaries to avoid partial matches
        pattern = r'\b' + re.escape(profanity) + r'\b'
        
        # Replace with asterisks of the same length
        def replace_with_asterisks(match):
            word = match.group(0)
            # Keep first letter, replace rest with asterisks
            if len(word) <= 1:
                return censor_char * len(word)
            return word[0] + censor_char * (len(word) - 1)
        
        censored_text = re.sub(pattern, replace_with_asterisks, censored_text, flags=re.IGNORECASE)
    
    return censored_text


def censor_segments(segments: List[Dict]) -> List[Dict]:
    """
    Apply profanity censoring to all segments
    
    Args:
        segments: List of segment dictionaries with 'text' field
    
    Returns:
        List of segments with censored text
    """
    censored_segments = []
    
    for segment in segments:
        censored_segment = segment.copy()
        if 'text' in censored_segment:
            censored_segment['text'] = censor_profanity(censored_segment['text'])
        censored_segments.append(censored_segment)
    
    return censored_segments


def censor_transcript(transcript: str) -> str:
    """
    Apply profanity censoring to full transcript text
    
    Args:
        transcript: Full transcript text
    
    Returns:
        Censored transcript
    """
    return censor_profanity(transcript)


# Test function
if __name__ == "__main__":
    # Test cases
    test_texts = [
        "This is a fucking terrible call",
        "What the hell is going on?",
        "Don't be a bitch about it",
        "That's some bullshit right there",
        "Normal text without profanity"
    ]
    
    print("Profanity Filter Test:")
    print("=" * 60)
    for text in test_texts:
        censored = censor_profanity(text)
        print(f"Original:  {text}")
        print(f"Censored:  {censored}")
        print("-" * 60)
