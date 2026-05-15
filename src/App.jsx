import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Activity, Scissors, Clock, Drum, 
  Sparkles, Download, ArrowRight, Loader2, 
  Copy, CheckCircle2, AlertCircle, Music,
  Settings, Camera, Trash2, Image as ImageIcon,
  ChevronRight, ChevronLeft, Save, Terminal,
  Play, Pause, Upload
} from 'lucide-react';

const appId = typeof __app_id !== 'undefined' ? __app_id : 'audio-prompt-studio';

// Función auxiliar robusta para convertir formatos de tiempo ("1:30", "15s", "0:05") a segundos
const timeToSeconds = (timeStr) => {
  if (!timeStr) return 0;
  const str = String(timeStr).toLowerCase().replace('s', '').trim();
  if (str.includes(':')) {
    const parts = str.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(str, 10) || 0;
};

export default function App() {
  const [step, setStep] = useState(1);
  const [script, setScript] = useState("");
  const [duration, setDuration] = useState(30);
  const [keywords, setKeywords] = useState("");
  const [keyframes, setKeyframes] = useState([{ id: Date.now(), time: "0:00", prompt: "", image: null, preview: null }]);
  
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeys, setApiKeys] = useState({ gemini: "", deepseek: "" });
  const [provider, setProvider] = useState("gemini");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysisData, setAnalysisData] = useState(null);
  const [copied, setCopied] = useState("");

  // Estados del Reproductor y Waveform Nativo
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [waveformData, setWaveformData] = useState([]);
  
  const audioRef = useRef(null);
  const canvasRef = useRef(null);

  const handleImageUpload = (id, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setKeyframes(prev => prev.map(kf => 
        kf.id === id ? { ...kf, image: reader.result.split(',')[1], preview: reader.result } : kf
      ));
    };
    reader.readAsDataURL(file);
  };

  const addKeyframe = () => setKeyframes([...keyframes, { id: Date.now(), time: "", prompt: "", image: null, preview: null }]);
  const removeKeyframe = (id) => { if (keyframes.length > 1) setKeyframes(keyframes.filter(kf => kf.id !== id)); };

  const runAnalysis = async () => {
    const activeKey = provider === "gemini" ? apiKeys.gemini : apiKeys.deepseek;
    if (!script.trim()) return setError("Por favor, ingresa un guion.");
    if (!activeKey.trim()) return setError(`Por favor, ingresa tu API Key de ${provider === 'gemini' ? 'Gemini' : 'DeepSeek'} en los Ajustes (⚙️ APIs Config).`);
    
    setIsLoading(true);
    setError("");

    // ==========================================
    // NUEVO PROMPT REFORZADO PARA SINCRONIZACIÓN
    // ==========================================
    const systemPrompt = `Eres un experto en diseño sonoro cinematográfico y composición algorítmica. Analiza este guion y sus señales visuales.
      RESTRICCIONES:
      - Duración total del track: ${duration} segundos.
      - Palabras clave obligatorias para acentos/kicks: "${keywords}".
      
      CRÍTICO PARA LA SINCRONIZACIÓN EN MUSICGEN:
      Para que los eventos sonoros ("step5_beats") coincidan matemáticamente en la onda de audio, tu "prompt_music" DEBE seguir esta estructura de "Time-coded Prompting":
      1. Inicia definiendo el tempo ideal (BPM) que cuadre con los silencios y acentos (Ej: "120 BPM").
      2. Redacta el desarrollo del track en INGLÉS utilizando corchetes de tiempo "[]" exactamente en los segundos donde hay eventos o palabras clave.
      3. Ejemplo de formato: "120 BPM, heavy cinematic hybrid trailer music. [0:00] slow atmospheric intro, [0:14] massive bass drop and heavy kicks, [0:22] rhythmic acceleration, [0:30] abrupt silence."

      Genera UN SOLO OBJETO JSON con la siguiente estructura exacta:
      {
        "step2_analysis": { "energia": "", "emocion": "", "ritmo": "", "tension": "", "intencion_viral": "" },
        "step3_scenes": [ { "fase": "HOOK/BUILDUP/CLIMAX/CTA", "texto": "" } ],
        "step4_retention": [ { "tiempo": "0-3s", "efecto": "" } ],
        "step5_beats": [ { "tiempo": "0:00", "evento": "" } ],
        "step6_recommendations": { "musica": "", "sonidos": "", "efectos": "", "ritmo": "" },
        "step7_prompts": { "prompt_fx": "Prompt EN INGLÉS descriptivo", "prompt_music": "Prompt EN INGLÉS estructurado con [BPM] y [marcas de tiempo]" }
      }`;

    try {
      let parsedData = null;
      if (provider === "gemini") {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeKey}`;
        const parts = [{ text: `Guion: ${script}\n\nFotogramas Clave:\n` }];
        keyframes.forEach(kf => {
          parts.push({ text: `Tiempo ${kf.time}: ${kf.prompt}` });
          if (kf.image) parts.push({ inlineData: { mimeType: "image/png", data: kf.image } });
        });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json" } })
        });
        if (!response.ok) throw new Error("Error en la API de Gemini");
        const result = await response.json();
        parsedData = JSON.parse(result.candidates[0].content.parts[0].text);
      } else {
        const endpoint = `https://api.deepseek.com/chat/completions`;
        const kfText = keyframes.map(kf => `[${kf.time}] ${kf.prompt}`).join(", ");
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeKey}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: systemPrompt + "\n\nIMPORTANTE: Devuelve ÚNICAMENTE formato JSON válido." },
              { role: "user", content: `Guion: ${script}\nFotogramas: ${kfText}` }
            ],
            response_format: { type: "json_object" }
          })
        });
        if (!response.ok) throw new Error("Error en la API de DeepSeek");
        const result = await response.json();
        let jsonString = result.choices[0].message.content.replace(/```json\n?|\n?```/g, '').trim();
        parsedData = JSON.parse(jsonString);
      }
      setAnalysisData(parsedData);
      setStep(2);
    } catch (err) {
      setError("No se pudo completar el análisis. Verifica tu API Key o conexión.");
    } finally {
      setIsLoading(false);
    }
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(analysisData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'audio_timeline.json';
    a.click();
  };

  const copyToClipboard = (txt, key) => {
    const textArea = document.createElement("textarea");
    textArea.value = txt;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); setCopied(key); setTimeout(() => setCopied(""), 2000); } catch (err) {}
    document.body.removeChild(textArea);
  };

  // ==========================================
  // LÓGICA DEL VISOR DE ONDA Y SINCRONIZACIÓN
  // ==========================================

  const handleAudioUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decodedData = await audioCtx.decodeAudioData(arrayBuffer);
        const channelData = decodedData.getChannelData(0); 
        
        const samples = 1500; 
        const blockSize = Math.floor(channelData.length / samples);
        const peaks = [];
        
        for(let i = 0; i < samples; i++) {
            let min = 0;
            let max = 0;
            for(let j = 0; j < blockSize; j++) {
                const val = channelData[i * blockSize + j];
                if (val < min) min = val;
                if (val > max) max = val;
            }
            peaks.push(Math.max(Math.abs(min), Math.abs(max)));
        }
        setWaveformData(peaks);
      } catch (err) {
        console.error("Error procesando forma de onda:", err);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const barWidth = width / waveformData.length;
    ctx.fillStyle = '#4f46e5'; 
    waveformData.forEach((peak, index) => {
        const barHeight = peak * height;
        const x = index * barWidth;
        const y = (height - barHeight) / 2;
        ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
    });

    if (audioDuration > 0) {
        const progressX = (currentTime / audioDuration) * width;
        ctx.fillStyle = 'rgba(99, 102, 241, 0.4)'; 
        ctx.fillRect(0, 0, progressX, height);
    }

    if (analysisData?.step5_beats && audioDuration > 0) {
        analysisData.step5_beats.forEach(beat => {
            const beatSecs = timeToSeconds(beat.tiempo);
            const xPos = (beatSecs / audioDuration) * width;
            
            ctx.beginPath();
            ctx.moveTo(xPos, 0);
            ctx.lineTo(xPos, height);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#f472b6'; 
            ctx.stroke();
            
            ctx.fillStyle = '#f472b6';
            ctx.beginPath(); ctx.arc(xPos, 4, 3, 0, 2 * Math.PI); ctx.fill();
            ctx.beginPath(); ctx.arc(xPos, height - 4, 3, 0, 2 * Math.PI); ctx.fill();
        });
    }

    if (audioDuration > 0) {
        const progressX = (currentTime / audioDuration) * width;
        ctx.beginPath();
        ctx.moveTo(progressX, 0);
        ctx.lineTo(progressX, height);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#22d3ee'; 
        ctx.stroke();
    }
  }, [waveformData, currentTime, audioDuration, analysisData]);

  const togglePlay = () => {
    if (audioRef.current) {
      isPlaying ? audioRef.current.pause() : audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setAudioDuration(audioRef.current.duration);
  };

  const handleSeek = (e) => {
    if (canvasRef.current && audioRef.current && audioDuration > 0) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newTime = percentage * audioDuration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Tolerancia de 0.5 segundos para resaltar el evento activo
  const sortedKeyframes = [...keyframes].sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time));
  const activeKeyframe = sortedKeyframes.slice().reverse().find(kf => timeToSeconds(kf.time) <= currentTime + 0.5) || sortedKeyframes[0];

  const sortedBeats = analysisData?.step5_beats ? [...analysisData.step5_beats].sort((a, b) => timeToSeconds(a.tiempo) - timeToSeconds(b.tiempo)) : [];
  const activeBeat = sortedBeats.slice().reverse().find(b => timeToSeconds(b.tiempo) <= currentTime + 0.5);

  const colabInstallScript = `!pip install av pesq\n!pip install --no-dependencies git+https://github.com/facebookresearch/audiocraft.git\n!pip install xformers "transformers<4.40.0" flashy hydra-core julius num2words sentencepiece encodec torchdiffeq torchmetrics omegaconf`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-3">
              <Activity className="text-cyan-400" /> AudioPrompt Studio
            </h1>
            <p className="text-slate-400">Diseño sonoro inteligente basado en narrativa</p>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-all text-sm font-medium">
            <Settings size={18} className={showSettings ? 'animate-spin-slow' : ''} /> ⚙️ APIs Config
          </button>
        </header>

        {showSettings && (
          <div className="mb-8 p-6 bg-slate-900 rounded-2xl border border-indigo-500/30 animate-in fade-in slide-in-from-top-4 duration-300">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">Configuración de Proveedores</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm text-slate-400">Gemini API Key (Multimodal)</label>
                <input type="password" value={apiKeys.gemini} onChange={(e) => setApiKeys({...apiKeys, gemini: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Paste Gemini Key..." />
                <div className="flex items-center gap-2"><input type="radio" checked={provider === "gemini"} onChange={() => setProvider("gemini")} id="p-gemini" /><label htmlFor="p-gemini" className="text-sm">Usar Gemini</label></div>
              </div>
              <div className="space-y-3">
                <label className="text-sm text-slate-400">DeepSeek API Key (Texto)</label>
                <input type="password" value={apiKeys.deepseek} onChange={(e) => setApiKeys({...apiKeys, deepseek: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Paste DeepSeek Key..." />
                <div className="flex items-center gap-2"><input type="radio" checked={provider === "deepseek"} onChange={() => setProvider("deepseek")} id="p-ds" /><label htmlFor="p-ds" className="text-sm">Usar DeepSeek</label></div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-8 pb-2">
          {[1,2,3,4,5,6,7,8].map(num => (
            <div key={num} className={`h-1.5 flex-1 min-w-[40px] rounded-full transition-all duration-500 ${step >= num ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-slate-800'}`} />
          ))}
        </div>

        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 rounded-3xl p-6 md:p-10 shadow-xl min-h-[500px]">
          
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-indigo-400 mb-2 uppercase tracking-wider">Guion del Proyecto</label>
                    <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="Pega aquí el guion o narrativa del video..." className="w-full h-48 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-amber-400 mb-2 uppercase tracking-wider">Duración Total (Seg)</label>
                      <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 outline-none focus:ring-1 focus:ring-amber-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-pink-400 mb-2 uppercase tracking-wider">Palabras Clave (Low Kicks)</label>
                      <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="ej: Impacto, ahora, boom..." className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 outline-none focus:ring-1 focus:ring-pink-500" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-emerald-400 uppercase tracking-wider">Señales Visuales (Storyboard)</label>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {keyframes.map((kf, idx) => (
                      <div key={kf.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-3 relative group">
                        <div className="flex gap-2">
                          <input type="text" placeholder="0:00" value={kf.time} onChange={(e) => { const newKfs = [...keyframes]; newKfs[idx].time = e.target.value; setKeyframes(newKfs); }} className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-xs outline-none" />
                          <input type="text" placeholder="Prompt visual..." value={kf.prompt} onChange={(e) => { const newKfs = [...keyframes]; newKfs[idx].prompt = e.target.value; setKeyframes(newKfs); }} className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-xs outline-none" />
                        </div>
                        <div className="relative h-20 bg-slate-900 rounded-lg border-2 border-dashed border-slate-800 overflow-hidden flex items-center justify-center group-hover:border-emerald-500/50 transition-all">
                          {kf.preview ? <img src={kf.preview} className="w-full h-full object-cover opacity-60" /> : <ImageIcon className="text-slate-700" size={24} />}
                          <label className="absolute inset-0 cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 bg-slate-950/40 transition-opacity">
                            <Camera size={20} className="text-white" />
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(kf.id, e.target.files[0])} />
                          </label>
                        </div>
                        {keyframes.length > 1 && <button onClick={() => removeKeyframe(kf.id)} className="absolute -top-2 -right-2 bg-red-900 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"><Trash2 size={12} /></button>}
                      </div>
                    ))}
                    <button onClick={addKeyframe} className="w-full py-2 border-2 border-dashed border-slate-800 rounded-xl text-slate-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all text-xs font-bold uppercase">+ Añadir Fotograma</button>
                  </div>
                </div>
              </div>

              {error && <div className="bg-red-950/30 border border-red-900 p-4 rounded-xl flex items-center gap-3 text-red-400 animate-pulse"><AlertCircle size={20} /> <span className="text-sm font-medium">{error}</span></div>}

              <button onClick={runAnalysis} disabled={isLoading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-indigo-900/20 transition-all active:scale-[0.98]">
                {isLoading ? <><Loader2 className="animate-spin" /> Procesando Sincronización Temporal...</> : <>Generar Arquitectura de Audio <Sparkles size={22} /></>}
              </button>
            </div>
          )}

          {/* PASO 2: RESULTADOS ANALISIS */}
          {step === 2 && analysisData && (
            <div className="space-y-8 animate-in fade-in duration-500">
               <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Activity className="text-cyan-400" /> Perfil Emocional del Proyecto
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Object.entries(analysisData.step2_analysis).map(([k, v]) => (
                  <div key={k} className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center hover:border-indigo-500/40 transition-all shadow-lg">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">{k.replace('_', ' ')}</p>
                    <p className="text-lg font-bold text-indigo-100">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 3: SCENES */}
          {step === 3 && analysisData && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-400">
               <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Scissors className="text-indigo-400" /> Segmentación de Escenas
              </h2>
              <div className="space-y-3">
                {analysisData.step3_scenes.map((s, i) => (
                  <div key={i} className="flex flex-col md:flex-row gap-4 bg-slate-950 p-5 rounded-2xl border border-slate-800 group hover:bg-slate-900/60 transition-all shadow-lg">
                    <span className={`px-4 py-1 rounded-full text-[11px] font-black w-fit h-fit uppercase tracking-wider
                      ${s.fase === 'CLIMAX' ? 'bg-red-900/40 text-red-400 border border-red-800' : 'bg-indigo-900/40 text-indigo-400 border border-indigo-800'}`}>
                      {s.fase}
                    </span>
                    <p className="text-slate-300 italic">"{s.texto}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 4: RETENTION */}
          {step === 4 && analysisData && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-400">
               <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Clock className="text-amber-400" /> Línea de Retención (Efectos)
              </h2>
              <div className="relative pl-8 border-l border-slate-800 space-y-10 py-4">
                {analysisData.step4_retention.map((r, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[37px] top-1.5 w-4 h-4 bg-amber-500 rounded-full border-4 border-slate-950" />
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 max-w-lg shadow-lg">
                      <span className="text-amber-500 font-mono text-xs font-bold">{r.tiempo}</span>
                      <p className="text-white font-semibold mt-1 uppercase tracking-tight">{r.efecto}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 5: BEATS */}
          {step === 5 && analysisData && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-400">
               <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Drum className="text-pink-400" /> Marcadores de Ritmo (Beats)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysisData.step5_beats.map((b, i) => (
                  <div key={i} className="flex items-center gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-lg">
                    <span className="text-pink-400 font-mono font-bold bg-pink-950/30 px-2 py-1 rounded">{b.tiempo}</span>
                    <ChevronRight className="text-slate-700" size={16} />
                    <span className="text-slate-300 text-sm font-medium">{b.evento}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 6: RECO */}
          {step === 6 && analysisData && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-400">
               <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Sparkles className="text-emerald-400" /> Recomendaciones Técnicas
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                {Object.entries(analysisData.step6_recommendations).map(([k, v]) => (
                  <div key={k} className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800 shadow-lg">
                    <h4 className="text-emerald-400 font-bold text-xs uppercase tracking-widest mb-4">{k}</h4>
                    <p className="text-slate-300 text-sm leading-relaxed">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 7: PROMPTS Y EXPORTACIÓN */}
          {step === 7 && analysisData && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-400">
               <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Music className="text-indigo-400" /> Prompts y Exportación</h2>
                 <button onClick={exportJSON} className="flex items-center gap-2 px-4 py-2 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-lg text-sm hover:bg-indigo-900/50 transition-all font-bold shadow-lg">
                   Exportar JSON <Download size={16} />
                 </button>
               </div>

               <div className="grid gap-6">
                 {/* MUSIC PROMPT (Ahora el protagonista) */}
                 <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-lg border-l-4 border-l-pink-500">
                    <div className="bg-slate-900 p-4 border-b border-slate-800 flex justify-between items-center">
                      <span className="font-bold text-pink-300 flex items-center gap-2 text-sm uppercase tracking-wider"><Music size={16}/> Prompt Estructurado para Música (MusicGen)</span>
                      <button onClick={() => copyToClipboard(analysisData.step7_prompts.prompt_music, 'mu')} className="text-slate-500 hover:text-white transition-all p-1">
                        {copied === 'mu' ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Copy size={18} />}
                      </button>
                    </div>
                    <div className="p-5 font-mono text-xs text-pink-100/90 leading-loose whitespace-pre-wrap">
                      {analysisData.step7_prompts.prompt_music}
                    </div>
                    <div className="px-5 pb-4 text-[10px] text-pink-500/80 italic">
                      * Nota: Este prompt incluye "Time-codes" y cálculo de BPM para forzar sincronía con tus Beats.
                    </div>
                 </div>

                 {/* FX PROMPT */}
                 <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
                    <div className="bg-slate-900 p-4 border-b border-slate-800 flex justify-between items-center">
                      <span className="font-bold text-indigo-300 flex items-center gap-2 text-sm uppercase tracking-wider"><Activity size={16}/> Prompt para FX</span>
                      <button onClick={() => copyToClipboard(analysisData.step7_prompts.prompt_fx, 'fx')} className="text-slate-500 hover:text-white transition-all p-1">
                        {copied === 'fx' ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Copy size={18} />}
                      </button>
                    </div>
                    <div className="p-5 font-mono text-xs text-slate-400 leading-loose whitespace-pre-wrap">
                      {analysisData.step7_prompts.prompt_fx}
                    </div>
                 </div>

                 <div className="bg-slate-900/80 rounded-2xl border border-slate-700 overflow-hidden shadow-lg mt-4">
                    <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                      <span className="font-bold text-amber-400 flex items-center gap-2 text-sm uppercase tracking-wider"><Terminal size={16}/> Configuración para Google Colab</span>
                      <button onClick={() => copyToClipboard(colabInstallScript, 'colab')} className="text-slate-500 hover:text-white transition-all p-1">{copied === 'colab' ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Copy size={18} />}</button>
                    </div>
                    <div className="p-4">
                      <pre className="p-3 bg-slate-950 rounded-lg font-mono text-xs text-amber-500/80 leading-relaxed overflow-x-auto whitespace-pre">{colabInstallScript}</pre>
                    </div>
                 </div>
               </div>
            </div>
          )}

          {/* PASO 8: REPRODUCTOR DE AUDIO CON WAVEFORM NATIVO */}
          {step === 8 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-400">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Play className="text-cyan-400" /> Visor Sincronizado
                </h2>
                
                {/* Leyenda de colores */}
                {audioUrl && (
                  <div className="flex gap-4 text-xs font-medium bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Audio</span>
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-pink-400"></div> Beats</span>
                    <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-cyan-400"></div> Posición</span>
                  </div>
                )}
              </div>
              
              {!audioUrl ? (
                <div className="border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center bg-slate-900/30 hover:border-indigo-500/50 transition-colors">
                  <Upload size={48} className="mx-auto text-slate-500 mb-4" />
                  <p className="text-slate-300 font-medium mb-4">Sube el archivo .wav generado en Google Colab para ver la onda</p>
                  <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold inline-block transition-all shadow-lg">
                    Examinar Archivo
                    <input type="file" className="hidden" accept="audio/*" onChange={handleAudioUpload} />
                  </label>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Reproductor con Canvas Waveform */}
                  <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl shadow-inner">
                    <audio 
                      ref={audioRef} 
                      src={audioUrl} 
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onEnded={() => setIsPlaying(false)}
                      className="hidden" 
                    />
                    
                    {/* CANVAS WAVEFORM INTERACTIVO */}
                    <div className="relative w-full h-32 bg-slate-900 rounded-lg mb-4 overflow-hidden border border-slate-800">
                      <canvas 
                        ref={canvasRef}
                        onClick={handleSeek}
                        className="w-full h-full cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <button onClick={togglePlay} className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-full transition-transform active:scale-95 shadow-lg shadow-indigo-900/30">
                        {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
                      </button>
                      <span className="font-mono text-indigo-400 font-bold bg-indigo-950/40 px-3 py-1 rounded-lg border border-indigo-900/50">
                        {Math.floor(currentTime / 60)}:{(Math.floor(currentTime % 60)).toString().padStart(2, '0')} 
                        <span className="text-slate-600"> / {Math.floor(audioDuration / 60)}:{(Math.floor(audioDuration % 60)).toString().padStart(2, '0')}</span>
                      </span>
                    </div>
                  </div>

                  {/* Sincronización con el Guion */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className={`border p-6 rounded-2xl relative overflow-hidden group transition-all duration-300
                      ${activeKeyframe?.prompt ? 'bg-slate-900 border-cyan-900/50' : 'bg-slate-900/50 border-slate-800'}`}>
                      <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
                      <h4 className="text-cyan-400 font-bold text-xs uppercase tracking-widest mb-2">Momento Visual Actual</h4>
                      {activeKeyframe?.prompt ? (
                        <p className="text-slate-200 text-lg leading-relaxed font-medium">"{activeKeyframe.prompt}"</p>
                      ) : (
                        <p className="text-slate-600 italic">Esperando inicio visual...</p>
                      )}
                    </div>

                    <div className={`border p-6 rounded-2xl relative overflow-hidden transition-all duration-300
                      ${activeBeat ? 'bg-pink-950/20 border-pink-900/50' : 'bg-slate-900/50 border-slate-800'}`}>
                      <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
                      <h4 className="text-pink-400 font-bold text-xs uppercase tracking-widest mb-2">Evento Sonoro (Beat)</h4>
                      {activeBeat ? (
                        <p className="text-pink-100 text-lg leading-relaxed font-medium capitalize">{activeBeat.evento}</p>
                      ) : (
                        <p className="text-slate-600 italic">Sin evento en este segundo...</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navegación Inferior */}
          {analysisData && (
            <div className="mt-12 pt-8 border-t border-slate-800 flex justify-between items-center">
               <button onClick={() => setStep(prev => prev - 1)} disabled={step === 1} className="flex items-center gap-2 text-slate-500 hover:text-white disabled:opacity-0 transition-all font-bold uppercase text-xs tracking-widest">
                 <ChevronLeft size={20}/> Anterior
               </button>
               <div className="text-slate-600 text-[10px] font-black uppercase tracking-[0.2em]">Fase {step} de 8</div>
               <button onClick={() => step === 8 ? setStep(1) : setStep(prev => prev + 1)} className="flex items-center gap-2 px-6 py-2 bg-slate-800 text-white rounded-full hover:bg-slate-700 transition-all font-bold uppercase text-xs tracking-widest border border-slate-700">
                 {step === 8 ? "Nuevo Proyecto" : "Siguiente"} <ChevronRight size={20}/>
               </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
