import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import * as fs from "node:fs";

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use the Nano Banana 2 model ID
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.1-flash-image-preview" 
});

async function generateGameUnit() {
  const prompt = 
                // "A top-down isometric pixel art warrior unit for a civ-style game, holding a spear, " +
                  "A top-down isometric pixel art charriot, with two horses and archer mounted, " +
                  "Don't draw any terrain, or terrain accidents like stones or water. "+
                  "Don't draw any shadows at all. "+
                 " vibrant colors, solid background color '#00ff00', sharp edges." + 
                 " The image should be 512x512 pixels.";

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;

    // The API returns images as inlineData (base64) within the parts array
    for (const part of response.candidates![0].content.parts) {
      if (part.inlineData) {
        const imageData = part.inlineData.data; // This is the base64 string
        const buffer = Buffer.from(imageData, "base64");
        
        const fileName = `tmp_unit_${Date.now()}.png`;
        fs.writeFileSync(fileName, buffer);
        console.log(`Success! Image saved as ${fileName}`);
      }
    }
  } catch (error) {
    console.error("Error generating image:", error);
  }
}

generateGameUnit();