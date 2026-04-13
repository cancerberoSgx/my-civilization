# how to generate unit images with transparent backgrounds

see scripts/src/gemini-image-generation/gemini-image-generation.ts to generate the image with gemini

Example instructions: 

```
A top-down isometric pixel art charriot, with two horses and archer mounted,  
Don't draw any terrain, or terrain accidents like stones or water. 
Don't draw any shadows at all. 
vibrant colors, solid background color '#00ff00', sharp edges. 
The image should be 512x512 pixels.
```


gemini is not able to generate transparent pngs, so we must do it ourselves with imagemagick:

```
bg=$(convert input2.png -format "%[pixel:p{0,0}]" info:)
convert input2.png -fuzz 20% -transparent "$bg" output2.png
```
