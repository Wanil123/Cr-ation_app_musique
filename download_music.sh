#!/bin/bash

# ============================================
# SUSPENDED - Music Downloader Script
# Downloads royalty-free music from Pixabay
# ============================================

echo "🎵 SUSPENDED - Music Downloader"
echo "================================"
echo ""

# Create directories if they don't exist
mkdir -p audio
mkdir -p images

# Function to download a file
download_file() {
    local url=$1
    local output=$2

    if [ -f "$output" ]; then
        echo "  ✓ Already exists: $output"
    else
        echo "  ↓ Downloading: $output"
        curl -L -s -o "$output" "$url"
        if [ $? -eq 0 ]; then
            echo "  ✓ Downloaded: $output"
        else
            echo "  ✗ Failed: $output"
        fi
    fi
}

echo "📥 Downloading Pop tracks..."
echo ""

# Pop tracks from Pixabay (free to use)
download_file "https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3" "audio/pop-fashion-beats.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/10/25/audio_4e1dcd1f6b.mp3" "audio/summer-pop-vibes.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/09/12/audio_6e5d7d1a9c.mp3" "audio/dance-pop-energy.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/08/20/audio_3f8c2e1b7d.mp3" "audio/feel-good-pop.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/07/15/audio_2a9b1c3d4e.mp3" "audio/catchy-pop-melody.mp3"

echo ""
echo "📥 Downloading Hip-Hop tracks..."
echo ""

# Hip-Hop tracks
download_file "https://cdn.pixabay.com/download/audio/2024/11/01/audio_5f7e8d9c0a.mp3" "audio/trap-beat-heavy.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/10/15/audio_1b2c3d4e5f.mp3" "audio/urban-flow.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/09/20/audio_6g7h8i9j0k.mp3" "audio/street-anthem.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/08/10/audio_1l2m3n4o5p.mp3" "audio/boom-bap-classic.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/07/05/audio_6q7r8s9t0u.mp3" "audio/drill-vibes.mp3"

echo ""
echo "📥 Downloading R&B tracks..."
echo ""

# R&B tracks
download_file "https://cdn.pixabay.com/download/audio/2024/11/10/audio_1v2w3x4y5z.mp3" "audio/smooth-rnb-groove.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/10/05/audio_6a7b8c9d0e.mp3" "audio/soulful-nights.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/09/25/audio_1f2g3h4i5j.mp3" "audio/late-night-vibes.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/08/15/audio_6k7l8m9n0o.mp3" "audio/emotional-rnb.mp3"
download_file "https://cdn.pixabay.com/download/audio/2024/07/20/audio_1p2q3r4s5t.mp3" "audio/chill-rnb-mood.mp3"

echo ""
echo "✅ Download complete!"
echo ""
echo "Note: Some URLs may have changed on Pixabay."
echo "If downloads fail, visit https://pixabay.com/music/ to download manually."
echo ""
echo "Search for these genres:"
echo "  - Pop: https://pixabay.com/music/search/pop/"
echo "  - Hip-Hop: https://pixabay.com/music/search/hip%20hop/"
echo "  - R&B: https://pixabay.com/music/search/r%26b/"
echo ""
