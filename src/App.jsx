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

// Función auxiliar para convertir "1:30" a 90 segundos
const timeToSeconds = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(timeStr, 10) || 0;
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

  // Reproductor Interactivo Nativo
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);

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

    const systemPrompt = `Eres un experto en diseño sonoro y composición musical. Analiza este guion y sus señales visuales.
      RESTRICCIONES:
      - Duración total del track: ${duration} segundos.
      - Palabras clave para acentos de Bajos/Kicks: ${keywords}.
      - Debes mapear los eventos según el tiempo y los fotogramas proporcionados.
      Genera UN SOLO OBJETO JSON con la siguiente estructura:
      {
        "step2_analysis": { "energia": "", "emocion": "", "ritmo": "", "tension": "", "intencion_viral": "" },
        "step3_scenes": [ { "fase": "HOOK/BUILDUP/CLIMAX/CTA", "texto": "" } ],
        "step4_retention": [ { "tiempo": "0-3s", "efecto": "" } ],
        "step5_beats": [ { "tiempo": "0:00", "evento": "" } ],
        "step6_recommendations": { "musica": "", "sonidos": "", "efectos": "", "ritmo": "" },
        "step7_prompts": { "prompt_fx": "Prompt EN INGLÉS", "prompt_music": "Prompt EN INGLÉS" }
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

  // Cargar Audio 
  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  };

  // Controles de Audio Nativos
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e) => {
    if (progressBarRef.current && audioRef.current) {
      const rect = progressBarRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const newTime = percentage * audioDuration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  // Encontrar la sección del guion activa basada en el tiempo actual
  const activeKeyframe = [...keyframes].reverse().find(kf => timeToSeconds(kf.time) <= currentTime) || keyframes[0];
  const activeBeat = analysisData?.step5_beats ? [...analysisData.step5_beats].reverse().find(b => timeToSeconds(b.tiempo) <= currentTime) : null;

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
                {isLoading ? <><Loader2 className="animate-spin" /> Procesando Multimodalidad...</> : <>Generar Arquitectura de Audio <Sparkles size={22} /></>}
              </button>
            </div>
          )}

          {/* PASOS 2-6 */}
          {step > 1 && step < 7 && analysisData && (
             <div className="space-y-8 animate-in fade-in duration-500 text-center py-20">
                <Activity size={48} className="mx-auto text-indigo-500 mb-4 opacity-50" />
                <h2 className="text-2xl font-bold text-white">Análisis IA Completado</h2>
                <p className="text-slate-400">Puedes revisar los perfiles de ritmo y emoción. Navega al Paso 7 para exportar.</p>
             </div>
          )}

          {step === 7 && analysisData && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-400">
               <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-white flex items-center gap-3"><Music className="text-indigo-400" /> Prompts y Exportación</h2>
                 <button onClick={exportJSON} className="flex items-center gap-2 px-4 py-2 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-lg text-sm hover:bg-indigo-900/50 transition-all font-bold">
                   Exportar JSON <Download size={16} />
                 </button>
               </div>

               <div className="grid gap-6">
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

          {/* PASO 8: REPRODUCTOR DE AUDIO SINCRONIZADO */}
          {step === 8 && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-400">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Play className="text-cyan-400" /> Visor Sincronizado
              </h2>
              
              {!audioUrl ? (
                <div className="border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center bg-slate-900/30">
                  <Upload size={48} className="mx-auto text-slate-500 mb-4" />
                  <p className="text-slate-300 font-medium mb-4">Sube el archivo .wav generado en Google Colab</p>
                  <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold inline-block transition-all shadow-lg">
                    Examinar Archivo
                    <input type="file" className="hidden" accept="audio/*" onChange={handleAudioUpload} />
                  </label>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Reproductor Personalizado NATIVO */}
                  <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl shadow-inner">
                    <audio 
                      ref={audioRef} 
                      src={audioUrl} 
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onEnded={() => setIsPlaying(false)}
                      className="hidden" 
                    />
                    
                    {/* Barra de progreso */}
                    <div 
                      ref={progressBarRef}
                      onClick={handleSeek}
                      className="w-full h-12 bg-slate-900 rounded-lg mb-4 cursor-pointer relative overflow-hidden border border-slate-800 hover:border-indigo-500/50 transition-colors"
                    >
                      <div 
                        className="h-full bg-indigo-600/50 absolute top-0 left-0 transition-all duration-75"
                        style={{ width: `${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%` }}
                      />
                      <div 
                        className="h-full bg-indigo-500 absolute top-0 left-0 transition-all duration-75 w-1"
                        style={{ left: `${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%` }}
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
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
                      <h4 className="text-cyan-400 font-bold text-xs uppercase tracking-widest mb-2">Momento Visual Actual</h4>
                      <p className="text-slate-200 text-lg leading-relaxed font-medium">"{activeKeyframe?.prompt || '...'}"</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
                      <h4 className="text-pink-400 font-bold text-xs uppercase tracking-widest mb-2">Evento Sonoro (Beat)</h4>
                      {activeBeat ? (
                        <p className="text-slate-200 text-lg leading-relaxed font-medium capitalize">{activeBeat.evento}</p>
                      ) : (
                        <p className="text-slate-500 italic">Esperando evento sonoro...</p>
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