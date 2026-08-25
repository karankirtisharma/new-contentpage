#!/usr/bin/env bash
# Procedural stand-in loops for the 4 CRT screens.
# Green/white/black only; each pattern's motion period divides its duration so the loop is seamless.
# Replaced automatically by assets-final/screen-a..d.mp4 when finals land.
set -e
cd "$(dirname "$0")"

# P (0..1) -> the SPEC-5 ramp: deep green in the shadows, #b8ffcc mint at full.
mk(){
  local out=$1 W=$2 H=$3 D=$4 FPS=$5 P=$6
  local C="clip($P\,0\,1)"
  ffmpeg -y -loglevel error -f lavfi -i "color=c=black:s=${W}x${H}:r=${FPS}:d=${D}" \
    -vf "format=rgb24,geq=r='255*pow($C\,2.2)*0.72':g='255*$C':b='255*pow($C\,1.7)*0.80',format=yuv420p" \
    -c:v libx264 -preset veryfast -crf 22 -an -movflags +faststart "$out"
  echo "  $out  $(du -h "$out" | cut -f1)"
}

# a — front screen (s1, plane 0.690x0.644): scrolling signal bars
mk screen-a.mp4 720 672 10 30 \
 '0.06+0.94*lt(mod(Y+T*67.2\,56)\,3)+0.50*lt(mod(X+T*72\,80)\,26)+0.25*lt(mod(X+T*72\,80)\,4)'

# b — right screen (s2, plane 0.860x0.640): expanding pulse rings on a grid
mk screen-b.mp4 720 536 8 25 \
 '0.05+0.90*lt(mod(hypot(X-360\,Y-268)-T*45\,60)\,5)+0.22*lt(mod(X\,48)\,1)+0.22*lt(mod(Y\,48)\,1)'

# c — left screen (s3, plane 0.870x0.650): the intro hero screen — step bars + sweep
mk screen-c.mp4 1024 512 12 24 \
 '0.10+0.30*mod(floor(X/128)\,3)+0.85*lt(abs(Y-mod(T*42.6667\,512))\,3)+0.35*lt(mod(Y\,32)\,1)'

# d — back screen (s4, plane 0.689x0.644, texture flipped in X): crosshair + expanding reticle
mk screen-d.mp4 720 720 6 30 \
 '0.04+0.20*lt(mod(X\,60)\,1)+0.20*lt(mod(Y\,60)\,1)+0.55*lt(abs(X-360)\,1)+0.55*lt(abs(Y-360)\,1)+0.95*lt(abs(max(abs(X-360)\,abs(Y-360))-mod(T*60\,360))\,2)'
