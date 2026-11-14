// Prompt kalıpları. ChatGPT/Claude'a gönderilen talimatlar İngilizce, çıktı JSON.
// Kalıplar "Sinematik Dersler" (Ders 1-5) üzerine kuruludur; Flow (Veo) için uyarlanmıştır.

const NEG = 'Avoid plastic skin, CGI look, cartoon style, distorted anatomy, blurry face, extra fingers, random objects, extra characters, text, logos, captions, watermarks, UI elements.';

const JSON_RULE = 'Return ONLY valid JSON, no markdown fences, no commentary.';

const VEO_RULES = [
  'Each video clip is at most 8 seconds. One location, max 3 actions, never write "cut to".',
  'Describe the character precisely (hair, face, skin, build, every clothing item) in EVERY clip and add: "Same person as the reference image, exact likeness, stable face throughout."',
  'Spoken dialogue must be in TURKISH, written in quotes after the words: says in Turkish, "...". Keep each line short enough to be spoken in the clip (about 18 words max for 8 seconds). Never translate the Turkish dialogue.',
  'Include camera movement, lighting, atmosphere and realistic physics.',
  'End every clip prompt with: "Stable face throughout. No morphing. No flickering. No subtitles, no text on screen. Natural Turkish speech with accurate lip sync."'
].join('\n- ');

const UGC_STYLE =
  'Ultra-realistic UGC style: vertical 9:16 smartphone footage, handheld, natural window light, real skin texture with pores, slight imperfections, casual authentic presence, looks like a real person filming themselves, not a polished ad.';

// ---------- ortak: karakter kiti (gri arka plan) ----------
function characterKit({ description, hasReference }) {
  return `You write image-generation prompts. Create ONE prompt for a character reference sheet ("character kit").
${hasReference ? 'A reference photo of the person will be attached to the image generator. The prompt must say: "Use the attached photo as strict identity reference, preserve exact likeness."' : 'Invent the person from the description below.'}
Person description (Turkish, may be short): ${description || '(none, use the reference photo)'}
Requirements for the prompt:
- Plain neutral mid-grey studio background, soft even lighting.
- A single horizontal 16:9 sheet showing the SAME person: full-body front view, full-body side view, full-body back view, plus three face close-ups (neutral, smiling, speaking).
- Ultra-realistic photo, visible skin pores, natural texture, realistic hands, same outfit in every view.
- No text, labels, logos or watermarks.
${JSON_RULE}
Schema: {"prompt": "...", "short_description": "one-sentence English description of the person and outfit"}`;
}

// ---------- 1) UGC ----------
function ugcScenes({ characterDesc, script, hasProduct, productNote }) {
  return `You are a UGC video director and prompt engineer for Google Veo (Flow).
Character (English description): ${characterDesc}
User's idea or script (Turkish): """${script}"""
${hasProduct ? `The character presents a product (a product photo is attached as a reference). Product note: ${productNote || 'none'}. Describe the product exactly as it looks and keep it consistent.` : 'No product.'}
Style: ${UGC_STYLE}
Split the content into clips of at most 8 seconds each (usually 1-6 clips). If the user gave a full script, keep the Turkish text word for word, split at natural sentence breaks. If only an idea was given, write natural, conversational Turkish dialogue, not advertising language.
Rules for every clip prompt:
- ${VEO_RULES}
${JSON_RULE}
Schema: {"title":"short Turkish title","clips":[{"seconds":8,"turkish_line":"...","prompt":"full English video prompt"}]}`;
}

// ---------- 2) Ürün tanıtımı ----------
function productShots({ style, productNote, count }) {
  return `You are a commercial director and prompt engineer for Google Veo (Flow).
One or more product photos are attached as references. Product note (Turkish): ${productNote || 'none'}.
Desired style: ${style}
Plan ${count || 3} product video clips (max 8 seconds each) that show the product beautifully: hero shot, detail/texture shot, usage or lifestyle shot. Keep the product's shape, color, label and proportions EXACTLY like the reference.
Rules:
- ${VEO_RULES.replace(/Spoken dialogue must be in TURKISH[^\n]*/,'No dialogue unless the style asks for a voice-over; if a voice-over is useful write it in Turkish in quotes.')}
- Add a matching still-image prompt ("start_frame_prompt") for the first frame of each clip.
${JSON_RULE}
Schema: {"title":"short Turkish title","clips":[{"seconds":8,"turkish_line":"","start_frame_prompt":"...","prompt":"full English video prompt"}]}`;
}

// ---------- 3) Zaman yolculuğu ----------
function historyIdeas({ era, wish }) {
  return `Suggest 8 gripping, historically grounded short-video story ideas for a Turkish audience${era ? ' set in: ' + era : ''}. ${wish ? 'The user wants: ' + wish : ''}
Each idea must be a single dramatic moment that can be told in 15-40 seconds (e.g. a famous event, a turning point, a daily-life glimpse). Be historically careful, avoid graphic violence: show tension and emotion, not gore.
${JSON_RULE}
Schema: {"ideas":[{"title":"Turkish title","era":"Turkish era/place","hook":"Turkish one-sentence summary"}]}`;
}

function historyScenes({ characterDesc, story, clipCount }) {
  return `You are a historical film director and prompt engineer for Google Veo (Flow).
The user's own character (English description): ${characterDesc}. The character is placed INSIDE the historical story below as narrator or witness, wearing authentic period clothing that fits the era, but keeping the exact same face.
Story (Turkish): """${story}"""
Write ${clipCount || 4} consecutive clips (max 8 seconds each) that tell it cinematically: realistic period costumes, architecture, props and lighting, film-grade color grading, no modern objects. Never show graphic gore; imply violence through framing, shadow and reaction.
Dialogue or narration must be in Turkish, short, dramatic, historically respectful.
Rules:
- ${VEO_RULES}
${JSON_RULE}
Schema: {"title":"short Turkish title","clips":[{"seconds":8,"turkish_line":"...","prompt":"full English video prompt"}]}`;
}

// ---------- 4) Sinematik ----------
function cinematicCharacter({ idea }) {
  return `Create a vertical 9:16 ultra-realistic cinematic image prompt using this formula, filling every slot yourself from the user's idea.
Formula: "Create a vertical 9:16 ultra-realistic cinematic image of [character: age, face, presence]. The character has [skin: visible pores, natural texture, subtle imperfections] and wears [styling: garment, material, colors, accessories]. Emotional energy: [calm/confident/mysterious/vulnerable]. The scene takes place in [environment], with [atmosphere: dust, fog, rain, reflections]. Use [lighting: golden hour, rim light, hard shadows], realistic shadows, natural color grading, and [camera: 35mm lens feel, shallow depth of field, low angle]. The image should feel like [genre or film reference]. ${NEG}"
User's idea (Turkish): """${idea}"""
${JSON_RULE}
Schema: {"prompt":"the complete final English prompt","short_description":"one-sentence English description of the character"}`;
}

function cinematicStoryboard({ characterDesc, story }) {
  return `Write a 9-panel, 15-second story in 3 acts (setup, tension, climax) for this cinematic character: ${characterDesc}.
User's story in one sentence (Turkish): """${story}"""
Timecodes: 0:00-0:01.5, 0:01.5-0:03, 0:03-0:04.5, 0:04.5-0:06, 0:06-0:07.5, 0:07.5-0:09, 0:09-0:10.5, 0:10.5-0:12.5, 0:12.5-0:15.
For each panel give shot type, a short title and one action sentence. One idea per panel, same location throughout, no cuts to other places.
Also write "storyboard_image_prompt": an English prompt for an image model: "Create a cinematic 3x3 timed storyboard for a 15-second video, based on the uploaded image. Professional film pre-production board, 9 panels in a clean grid with black borders. Each panel includes: panel number, timecode, a short shot title, one short action description. Keep the same face, outfit, materials, environment, lighting and color grading in every panel. Panels: ..." with your 9 panels written in.
${JSON_RULE}
Schema: {"panels":[{"n":1,"time":"0:00-0:01.5","shot":"...","title":"...","action":"..."}],"storyboard_image_prompt":"..."}`;
}

// Ders 3: karakter görseli + zaman kodlu storyboard -> tek bir 15 saniyelik video promptu.
// Flow'da referanslar sırayla eklenir: 1) karakter, 2) storyboard, (devamda) 3) önceki klibin son karesi.
function cinematicVideo({ characterDesc, panels, isContinuation, spokenIdea }) {
  return `You are an expert cinematic prompt engineer for Google Veo (Flow). Write ONE video prompt in English, at most 3800 characters, for a single 15-second clip.
The reference images are attached to the video model in this order:
- Reference 1: the character (strict identity reference).
- Reference 2: the 3x3 timed storyboard of this clip.${isContinuation ? '\n- Reference 3: the last frame of the previous clip. The clip must START exactly from this frame (same pose, place and light) and then follow the storyboard.' : ''}
Start the prompt by describing each reference in one detailed sentence (reference 1: the character, reference 2: the storyboard${isContinuation ? ', reference 3: the previous last frame' : ''}).
Character: ${characterDesc}
Describe the character precisely (hair, face, skin, build, every clothing item, accessories) and add: "Use reference 1 as strict identity reference. Preserve exact likeness. Stable face throughout."
Storyboard panels (use these timecodes exactly, written like (0s-1.5s), (1.5s-3s)): ${JSON.stringify(panels)}
Rules:
- Each timecode segment needs 3-5 sentences: action, character movement and expression, camera movement and angle, lighting and atmosphere, physics or effects.
- Never write "cut to". Max 3-4 actions per segment, one location. No brand names or copyrighted characters. Describe what you want instead of using negative prompts.
- ${spokenIdea ? 'Any spoken line must be in Turkish, written in quotes.' : 'No dialogue; cinematic sound and ambience only.'}
- End the prompt with: "Stable face throughout. No morphing. No deformation. No flickering. No ghosting. No subtitles, no text on screen. Realistic physics. 4K cinematic."
${JSON_RULE}
Schema: {"prompt":"..."}`;
}

// Devam storyboard'u: önceki storyboard'un devamı (ilk karesi önceki son panelden başlar).
function cinematicStoryboardNext({ characterDesc, storySoFar, prevPanels, userDirection }) {
  return `A cinematic story continues. Character: ${characterDesc}
Story so far (Turkish): """${storySoFar}"""
The previous 15-second storyboard ended with these panels: ${JSON.stringify((prevPanels || []).slice(-3))}
${userDirection ? 'The user wants the next part to go like this (Turkish): """' + userDirection + '"""' : 'Choose the most gripping next part yourself.'}
Write the NEXT 9-panel, 15-second storyboard in 3 acts (setup, tension, climax) that directly CONTINUES the previous one: panel 1 begins exactly where the previous storyboard ended (same place, light, pose), then escalates. Timecodes: 0:00-0:01.5, 0:01.5-0:03, 0:03-0:04.5, 0:04.5-0:06, 0:06-0:07.5, 0:07.5-0:09, 0:09-0:10.5, 0:10.5-0:12.5, 0:12.5-0:15.
For each panel give shot type, a short title and one action sentence. One idea per panel, no cuts to other places.
Also write "storyboard_image_prompt": an English prompt for an image model: "Create a cinematic 3x3 timed storyboard for the NEXT 15 seconds of the story, based on the attached character image and the previous storyboard (which it continues). Professional film pre-production board, 9 panels in a clean grid with black borders. Each panel includes: panel number, timecode, a short shot title, one short action description. Keep the same face, outfit, materials, environment, lighting and color grading in every panel. Panels: ..." with your 9 panels written in.
Also write "summary_tr": a Turkish one-sentence summary of this new part.
${JSON_RULE}
Schema: {"panels":[{"n":1,"time":"0:00-0:01.5","shot":"...","title":"...","action":"..."}],"storyboard_image_prompt":"...","summary_tr":"..."}`;
}

function continueStory({ characterDesc, storySoFar, userDirection }) {
  return `A cinematic story continues. Character: ${characterDesc}
Story so far (Turkish): """${storySoFar}"""
${userDirection ? 'The user wants the next part to go like this (Turkish): """' + userDirection + '"""' : 'Propose the most gripping next part yourself.'}
Write the next 2 clips (max 8 seconds each) continuing seamlessly from the last frame of the previous clip: same location logic, same character, escalating tension. Follow the same rules: character described precisely, stable face line, no "cut to", max 3 actions per clip, camera/lighting/physics detail, Turkish dialogue only if needed.
${JSON_RULE}
Schema: {"summary_tr":"Turkish one-sentence summary of this new part","clips":[{"seconds":8,"turkish_line":"","prompt":"..."}]}`;
}

function nextStoryIdeas({ storySoFar }) {
  return `Story so far (Turkish): """${storySoFar}"""
Suggest 4 different ways to continue it, each as one Turkish sentence.
${JSON_RULE}
Schema: {"options":["...","...","...","..."]}`;
}

// Hata sonrası: içerik reddedildiyse promptu yumuşat
function softenPrompt({ prompt, reason }) {
  return `This video prompt was rejected or failed in Google Flow (${reason || 'content policy'}). Rewrite it with the same story and the same Turkish lines but safer: soften violent verbs, remove brand/celebrity names, avoid anything graphic, keep identity and camera instructions.
Prompt: """${prompt}"""
${JSON_RULE}
Schema: {"prompt":"..."}`;
}

module.exports = {
  NEG, characterKit, ugcScenes, productShots, historyIdeas, historyScenes,
  cinematicCharacter, cinematicStoryboard, cinematicVideo, cinematicStoryboardNext, continueStory, nextStoryIdeas, softenPrompt
};
