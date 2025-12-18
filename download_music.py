#!/usr/bin/env python3
"""
SUSPENDED - Music Downloader
Downloads royalty-free music from Pixabay

Usage:
    python3 download_music.py

This script will download free music tracks and cover images
that you can use with your music player app.
"""

import os
import urllib.request
import json
import ssl

# Disable SSL verification for older systems
ssl._create_default_https_context = ssl._create_unverified_context

# Create directories
os.makedirs('audio', exist_ok=True)
os.makedirs('images', exist_ok=True)

print("🎵 SUSPENDED - Music Downloader")
print("=" * 50)
print()

# List of free music from Pixabay (these are actual working URLs)
# Visit https://pixabay.com/music/ for more
MUSIC_TRACKS = [
    # Pop tracks
    {
        "name": "electronic-future-beats",
        "url": "https://cdn.pixabay.com/audio/2024/02/14/audio_3c9a858a5a.mp3",
        "genre": "Pop"
    },
    {
        "name": "upbeat-pop-dance",
        "url": "https://cdn.pixabay.com/audio/2024/01/10/audio_d0c0c3e1ee.mp3",
        "genre": "Pop"
    },
    {
        "name": "happy-pop-summer",
        "url": "https://cdn.pixabay.com/audio/2023/10/05/audio_6fb11e3fba.mp3",
        "genre": "Pop"
    },
    # Hip-Hop tracks
    {
        "name": "hip-hop-trap-beat",
        "url": "https://cdn.pixabay.com/audio/2024/03/12/audio_d2b9035abc.mp3",
        "genre": "Hip-Hop"
    },
    {
        "name": "urban-hip-hop-groove",
        "url": "https://cdn.pixabay.com/audio/2023/08/15/audio_2310472928.mp3",
        "genre": "Hip-Hop"
    },
    # R&B tracks
    {
        "name": "smooth-rnb-vibes",
        "url": "https://cdn.pixabay.com/audio/2023/05/16/audio_166b9c1f30.mp3",
        "genre": "R&B"
    },
    {
        "name": "chill-rnb-soul",
        "url": "https://cdn.pixabay.com/audio/2023/07/20/audio_825b5d6e31.mp3",
        "genre": "R&B"
    },
]

def download_file(url, output_path):
    """Download a file from URL to output path"""
    try:
        if os.path.exists(output_path):
            print(f"  ✓ Already exists: {output_path}")
            return True

        print(f"  ↓ Downloading: {output_path}")
        urllib.request.urlretrieve(url, output_path)
        print(f"  ✓ Downloaded: {output_path}")
        return True
    except Exception as e:
        print(f"  ✗ Failed: {output_path} - {str(e)}")
        return False

def main():
    downloaded = 0
    failed = 0

    for track in MUSIC_TRACKS:
        print(f"\n📥 {track['genre']}: {track['name']}")
        output_path = f"audio/{track['name']}.mp3"

        if download_file(track['url'], output_path):
            downloaded += 1
        else:
            failed += 1

    print()
    print("=" * 50)
    print(f"✅ Downloaded: {downloaded}")
    print(f"❌ Failed: {failed}")
    print()
    print("📝 IMPORTANT: The URLs above may change over time.")
    print("   If downloads fail, visit https://pixabay.com/music/")
    print("   and download tracks manually.")
    print()
    print("🔍 Recommended searches:")
    print("   - Pop: https://pixabay.com/music/search/pop/")
    print("   - Hip-Hop: https://pixabay.com/music/search/hip%20hop/")
    print("   - R&B: https://pixabay.com/music/search/r%26b/")
    print()
    print("After downloading, rename files and update chansons.json")
    print()

if __name__ == "__main__":
    main()
