// File: api/gemini.js
export default async function handler(req, res) {
    // Hanya izinkan metode POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { systemPrompt, userPrompt } = req.body;
    
    // Mengambil kunci rahasia dari brankas Vercel (Environment Variable)
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: API Key is missing.' });
    }

    const MODEL_NAME = "gemini-3.1-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    root_cause_analysis: { type: "STRING" },
                    validation_message: { type: "STRING" },
                    steps: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                action: { type: "STRING" },
                                duration: { type: "INTEGER" }
                            },
                            required: ["action", "duration"]
                        }
                    }
                },
                required: ["root_cause_analysis", "validation_message", "steps"]
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Google API responded with status: ${response.status}`);
        }

        const data = await response.json();
        let textResponse = data.candidates[0].content.parts[0].text;
        
        // Pembersihan format
        const cleanedText = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        // Kembalikan ke Frontend
        return res.status(200).json(JSON.parse(cleanedText));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Gagal terhubung ke AI.' });
    }
}