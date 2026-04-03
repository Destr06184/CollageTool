/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Play, 
  Download, 
  Trash2, 
  Plus, 
  Film, 
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertCircle,
  GripVertical,
  Settings2,
  Info
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Utility for Tailwind class merging
 */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Photo {
  id: string;
  url: string;
  file: File;
}

type TransitionType = 'fade' | 'slide' | 'zoom' | 'wipe' | 'rotate' | 'blur';
type AspectRatio = '16:9' | '4:3' | '1:1';
type EasingType = 'linear' | 'easeInOut' | 'bounce' | 'overshoot';

interface Track {
  id: string;
  name: string;
  url: string;
}

const ASPECT_RATIOS: Record<AspectRatio, { width: number, height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '4:3': { width: 960, height: 720 },
  '1:1': { width: 720, height: 720 }
};

const AUDIO_LIBRARY: Track[] = [
  { id: 'lofi', name: 'Lofi Chill', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'upbeat', name: 'Upbeat Energy', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'cinematic', name: 'Cinematic Dream', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

const EASING_FUNCTIONS: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    else return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  overshoot: (t) => {
    const s = 1.70158;
    return --t * t * ((s + 1) * t + s) + 1;
  }
};

const TransitionPreview = ({ type, speed = 1 }: { type: TransitionType, speed?: number }) => {
  const variants = {
    fade: {
      initial: { opacity: 1 },
      animate: { opacity: [1, 0, 1] }
    },
    slide: {
      initial: { x: 0 },
      animate: { x: [0, -20, 0] }
    },
    zoom: {
      initial: { scale: 1 },
      animate: { scale: [1, 1.5, 1] }
    },
    wipe: {
      initial: { clipPath: 'inset(0 0 0 0)' },
      animate: { clipPath: ['inset(0 0 0 0)', 'inset(0 0 100% 0)', 'inset(0 0 0 0)'] }
    },
    rotate: {
      initial: { rotate: 0 },
      animate: { rotate: [0, 180, 360] }
    },
    blur: {
      initial: { filter: 'blur(0px)' },
      animate: { filter: ['blur(0px)', 'blur(4px)', 'blur(0px)'] }
    }
  };

  return (
    <div className="w-full h-8 bg-neutral-800 rounded overflow-hidden relative mb-1">
      <motion.div 
        className="absolute inset-0 bg-indigo-500/40"
        variants={variants[type]}
        initial="initial"
        animate="animate"
        transition={{ duration: 2 / speed, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 border border-white/5 pointer-events-none" />
    </div>
  );
};

const SortablePhotoItem: React.FC<{ photo: Photo, onRemove: (id: string) => void }> = ({ photo, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-2 rounded-xl bg-neutral-800/30 border border-neutral-800/50 group"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-neutral-600 hover:text-neutral-400">
        <GripVertical size={16} />
      </div>
      <img 
        src={photo.url} 
        alt="" 
        className="w-12 h-12 rounded-lg object-cover bg-neutral-800"
        referrerPolicy="no-referrer"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate text-neutral-300">{photo.file.name}</p>
      </div>
      <button 
        onClick={() => onRemove(photo.id)}
        className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-600 hover:text-red-400 transition-colors"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Settings
  const [selectedTransitions, setSelectedTransitions] = useState<TransitionType[]>(['fade']);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [transitionDuration, setTransitionDuration] = useState(1000); // ms
  const [slideDuration, setSlideDuration] = useState(3000); // ms
  const [musicVolume, setMusicVolume] = useState(0.5);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [customAudio, setCustomAudio] = useState<{ file: File, url: string } | null>(null);
  
  // Advanced Settings
  const [easingType, setEasingType] = useState<EasingType>('easeInOut');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } = ASPECT_RATIOS[aspectRatio];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPhotos((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setVideoUrl(null);
    }
  };

  const toggleTransition = (type: TransitionType) => {
    setSelectedTransitions(prev => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    addFiles(files);
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (customAudio) URL.revokeObjectURL(customAudio.url);
      setCustomAudio({
        file,
        url: URL.createObjectURL(file)
      });
      setSelectedTrack(null);
    }
  };

  const addFiles = (files: File[]) => {
    const newPhotos = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      url: URL.createObjectURL(file),
      file
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
    setVideoUrl(null);
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const filtered = prev.filter(p => p.id !== id);
      const removed = prev.find(p => p.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return filtered;
    });
    setVideoUrl(null);
  };

  const generateVideo = async () => {
    if (photos.length === 0) return;
    
    setIsGenerating(true);
    setProgress(0);
    setError(null);

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas not found");

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error("Could not get canvas context");

      // Load all images
      const loadedImages = await Promise.all(
        photos.map(photo => {
          return new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(new Error(`Failed to load image: ${photo.file.name}`));
            img.src = photo.url;
          });
        })
      );

      // Detect supported MIME type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      
      if (!supportedMimeType) {
        throw new Error("Your browser does not support video recording.");
      }

      // Handle Audio
      let audioStream: MediaStreamTrack | null = null;
      const audioUrl = customAudio?.url || selectedTrack?.url;
      
      if (audioUrl) {
        try {
          const audio = new Audio();
          audio.crossOrigin = "anonymous";
          audio.src = audioUrl;
          audio.volume = musicVolume;
          
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioCtx.createMediaElementSource(audio);
          const destination = audioCtx.createMediaStreamDestination();
          source.connect(destination);
          source.connect(audioCtx.destination);
          
          audioStream = destination.stream.getAudioTracks()[0];
          await audio.play();
          (window as any)._currentAudio = audio;
        } catch (audioErr) {
          console.warn("Audio capture failed, proceeding without sound:", audioErr);
        }
      }

      const FPS = 30;
      const videoStream = canvas.captureStream(FPS);
      const videoTrack = videoStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("Could not capture video track from canvas");

      const combinedStream = new MediaStream([videoTrack]);
      if (audioStream) combinedStream.addTrack(audioStream);

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 5000000 
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      const recordingPromise = new Promise<string>((resolve, reject) => {
        recorder.onstop = () => {
          if (chunks.length === 0) {
            reject(new Error("No video data was recorded."));
            return;
          }
          const blob = new Blob(chunks, { type: supportedMimeType });
          resolve(URL.createObjectURL(blob));
        };
        recorder.onerror = (e) => reject(new Error("Recorder error occurred."));
      });

      recorder.start();

      const totalImages = loadedImages.length;
      const framesPerSlide = Math.max(1, Math.round((slideDuration / 1000) * FPS));
      const framesPerTransition = Math.max(1, Math.round((transitionDuration / 1000) * FPS));
      const easing = EASING_FUNCTIONS[easingType];

      for (let i = 0; i < totalImages; i++) {
        const currentImg = loadedImages[i];
        const nextImg = loadedImages[(i + 1) % totalImages];
        const currentTransition = selectedTransitions[Math.floor(Math.random() * selectedTransitions.length)];
        const totalFrames = framesPerSlide + framesPerTransition;
        
        for (let f = 0; f < totalFrames; f++) {
          ctx.globalAlpha = 1.0;
          ctx.filter = 'none';
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

          const drawImage = (img: HTMLImageElement, opacity: number, scaleOffset: number, xOffset = 0, yOffset = 0, rotation = 0, blur = 0) => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
            if (blur > 0) ctx.filter = `blur(${blur}px)`;
            
            const baseScale = Math.max(VIDEO_WIDTH / img.width, VIDEO_HEIGHT / img.height);
            const scale = baseScale * (1 + scaleOffset);
            const w = img.width * scale;
            const h = img.height * scale;
            
            ctx.translate(VIDEO_WIDTH / 2 + xOffset, VIDEO_HEIGHT / 2 + yOffset);
            if (rotation !== 0) ctx.rotate(rotation);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
          };

          if (f < framesPerSlide || (i === totalImages - 1 && f >= framesPerSlide)) {
            const progress = f / totalFrames;
            drawImage(currentImg, 1, progress * 0.05);
          } else {
            const rawProgress = (f - framesPerSlide) / framesPerTransition;
            const tProgress = easing(rawProgress);
            
            switch (currentTransition) {
              case 'fade':
                drawImage(currentImg, 1 - tProgress, 0.05 + tProgress * 0.02);
                drawImage(nextImg, tProgress, tProgress * 0.05);
                break;
              case 'slide':
                drawImage(currentImg, 1, 0.05, -tProgress * VIDEO_WIDTH);
                drawImage(nextImg, 1, 0, VIDEO_WIDTH - tProgress * VIDEO_WIDTH);
                break;
              case 'zoom':
                drawImage(currentImg, 1 - tProgress, 0.05 + tProgress * 0.5);
                drawImage(nextImg, tProgress, 0.5 - tProgress * 0.5);
                break;
              case 'wipe':
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT * (1 - tProgress));
                ctx.clip();
                drawImage(currentImg, 1, 0.05);
                ctx.restore();
                
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, VIDEO_HEIGHT * (1 - tProgress), VIDEO_WIDTH, VIDEO_HEIGHT * tProgress);
                ctx.clip();
                drawImage(nextImg, 1, 0);
                ctx.restore();
                break;
              case 'rotate':
                drawImage(currentImg, 1 - tProgress, 0.05, 0, 0, tProgress * Math.PI);
                drawImage(nextImg, tProgress, 0, 0, 0, (tProgress - 1) * Math.PI);
                break;
              case 'blur':
                drawImage(currentImg, 1 - tProgress, 0.05, 0, 0, 0, tProgress * 20);
                drawImage(nextImg, tProgress, 0, 0, 0, 0, (1 - tProgress) * 20);
                break;
            }
          }

          setProgress(Math.round(((i * totalFrames + f) / (totalImages * totalFrames)) * 100));
          await new Promise(r => setTimeout(r, 1000 / FPS));
        }
      }

      recorder.stop();
      if ((window as any)._currentAudio) {
        (window as any)._currentAudio.pause();
        (window as any)._currentAudio = null;
      }

      const url = await recordingPromise;
      setVideoUrl(url);
      setIsGenerating(false);
      setProgress(100);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[60%] -right-[10%] w-[50%] h-[50%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-4"
          >
            <Film size={14} />
            <span>Создание Видео-Коллажей</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400"
          >
            Воспоминания в Движении
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-neutral-400 text-lg max-w-2xl mx-auto"
          >
            Создавайте профессиональные видео из ваших фотографий с музыкой и эффектами.
          </motion.p>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Photos & Settings */}
          <div className="lg:col-span-4 space-y-6">
            {/* Photos Section */}
            <section className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ImageIcon size={18} className="text-indigo-400" />
                  Фотографии
                </h2>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>

              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple 
                accept="image/*" 
                className="hidden" 
              />

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext 
                    items={photos.map(p => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <AnimatePresence mode="popLayout">
                      {photos.map((photo) => (
                        <SortablePhotoItem 
                          key={photo.id} 
                          photo={photo} 
                          onRemove={removePhoto} 
                        />
                      ))}
                    </AnimatePresence>
                  </SortableContext>
                </DndContext>
                
                {photos.length === 0 && (
                  <div className="py-8 text-center text-neutral-600 text-xs italic border border-dashed border-neutral-800 rounded-xl">
                    Фотографии не добавлены
                  </div>
                )}
              </div>
            </section>

            {/* Transition Settings */}
            <section className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Film size={18} className="text-indigo-400" />
                  Переходы
                </h2>
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    showAdvanced ? "bg-indigo-500/20 text-indigo-400" : "bg-neutral-800 text-neutral-500 hover:text-neutral-400"
                  )}
                >
                  <Settings2 size={18} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 block">
                    Формат Видео
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {(['16:9', '4:3', '1:1'] as AspectRatio[]).map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setAspectRatio(ratio)}
                        className={cn(
                          "py-2 rounded-lg text-[10px] font-bold border transition-all",
                          aspectRatio === ratio
                            ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400"
                            : "bg-neutral-800/50 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                        )}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>

                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 block">
                    Стили (Выберите несколько для перемешивания)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['fade', 'slide', 'zoom', 'wipe', 'rotate', 'blur'] as TransitionType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleTransition(type)}
                        className={cn(
                          "p-2 rounded-lg text-[10px] font-bold border transition-all flex flex-col items-center",
                          selectedTransitions.includes(type)
                            ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400"
                            : "bg-neutral-800/50 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                        )}
                      >
                        <TransitionPreview type={type} />
                        <span className="capitalize">{type === 'fade' ? 'Затухание' : type === 'slide' ? 'Сдвиг' : type === 'zoom' ? 'Зум' : type === 'wipe' ? 'Шторка' : type === 'rotate' ? 'Вращение' : 'Размытие'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-4 pt-2 border-t border-neutral-800"
                    >
                      <div>
                        <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 block">Плавность (Easing)</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['linear', 'easeInOut', 'bounce', 'overshoot'] as EasingType[]).map((type) => (
                            <button
                              key={type}
                              onClick={() => setEasingType(type)}
                              className={cn(
                                "py-2 rounded-lg text-[10px] font-bold border transition-all",
                                easingType === type
                                  ? "bg-purple-500/10 border-purple-500/50 text-purple-400"
                                  : "bg-neutral-800/50 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                              )}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Длительность Перехода</label>
                    <span className="text-xs text-indigo-400 font-mono">{transitionDuration}мс</span>
                  </div>
                  <input 
                    type="range" 
                    min="200" 
                    max="3000" 
                    step="100"
                    value={transitionDuration}
                    onChange={(e) => setTransitionDuration(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Показ Фотографии</label>
                    <span className="text-xs text-indigo-400 font-mono">{slideDuration}мс</span>
                  </div>
                  <input 
                    type="range" 
                    min="1000" 
                    max="10000" 
                    step="500"
                    value={slideDuration}
                    onChange={(e) => setSlideDuration(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>
            </section>

            {/* Audio Settings */}
            <section className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Plus size={18} className="text-indigo-400" />
                Фоновая Музыка
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 block">Библиотека</label>
                  <div className="space-y-2">
                    {AUDIO_LIBRARY.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => {
                          setSelectedTrack(track);
                          setCustomAudio(null);
                        }}
                        className={cn(
                          "w-full px-3 py-2 rounded-lg text-left text-xs font-medium border transition-all flex items-center justify-between",
                          selectedTrack?.id === track.id
                            ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400"
                            : "bg-neutral-800/50 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                        )}
                      >
                        {track.name}
                        {selectedTrack?.id === track.id && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => audioInputRef.current?.click()}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-xs font-medium border border-dashed transition-all flex items-center justify-center gap-2",
                      customAudio 
                        ? "bg-purple-500/10 border-purple-500/50 text-purple-400"
                        : "bg-neutral-800/30 border-neutral-800 text-neutral-500 hover:border-neutral-700"
                    )}
                  >
                    <Upload size={14} />
                    {customAudio ? customAudio.file.name : "Загрузить Свой Аудиофайл"}
                  </button>
                  <input 
                    type="file" 
                    ref={audioInputRef}
                    onChange={handleAudioChange}
                    accept="audio/*" 
                    className="hidden" 
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Громкость</label>
                    <span className="text-xs text-indigo-400 font-mono">{Math.round(musicVolume * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Preview */}
          <div className="lg:col-span-8 space-y-6">
            <section className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Play size={20} className="text-indigo-400" />
                  Предпросмотр
                </h2>
              </div>

              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-neutral-800 flex items-center justify-center group">
                <canvas 
                  ref={canvasRef} 
                  width={VIDEO_WIDTH} 
                  height={VIDEO_HEIGHT}
                  className="w-full h-full object-contain"
                />
                
                {isGenerating && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-8 z-10">
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-6" />
                    <p className="text-xl font-bold mb-2">Создание Шедевра</p>
                    <div className="w-full max-w-md bg-neutral-800 h-2.5 rounded-full overflow-hidden shadow-inner mb-4">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-indigo-600 to-purple-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-neutral-400 font-mono mb-6">{progress}% Завершено</p>
                    
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                      <AlertCircle size={14} />
                      <span>Пожалуйста, не покидайте вкладку до завершения рендеринга!</span>
                    </div>
                  </div>
                )}

                {videoUrl && (
                  <div className="absolute inset-0 bg-black z-20">
                    <video 
                      key={videoUrl}
                      src={videoUrl} 
                      controls 
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {photos.length === 0 && (
                  <div className="text-center p-12">
                    <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-6">
                      <ImageIcon size={40} className="text-neutral-800" />
                    </div>
                    <p className="text-neutral-500 text-lg">Добавьте фото, чтобы начать</p>
                  </div>
                )}
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3"
                >
                  <AlertCircle size={18} />
                  {error}
                </motion.div>
              )}

              <div className="mt-auto pt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  disabled={photos.length < 2 || isGenerating}
                  onClick={generateVideo}
                  className={cn(
                    "relative h-14 rounded-xl font-bold transition-all flex items-center justify-center gap-3 overflow-hidden group sm:col-span-1",
                    photos.length < 2 || isGenerating
                      ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                      : "bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98] shadow-xl shadow-indigo-500/20"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>Обработка...</span>
                    </>
                  ) : (
                    <>
                      <Play size={20} fill="currentColor" />
                      <span>Создать Видео</span>
                    </>
                  )}
                </button>

                <a
                  href={videoUrl || '#'}
                  download={`collage-${aspectRatio}.webm`}
                  className={cn(
                    "h-14 rounded-xl font-bold transition-all flex items-center justify-center gap-3 border-2",
                    !videoUrl || isGenerating
                      ? "bg-transparent border-neutral-800 text-neutral-700 cursor-not-allowed pointer-events-none"
                      : "bg-neutral-800 text-white hover:bg-neutral-700 border-neutral-800 active:scale-[0.98]"
                  )}
                >
                  <Download size={20} />
                  <span>WebM</span>
                </a>

                <a
                  href={videoUrl || '#'}
                  download={`collage-${aspectRatio}.mp4`}
                  onClick={(e) => {
                    if (!videoUrl) e.preventDefault();
                  }}
                  className={cn(
                    "h-14 rounded-xl font-bold transition-all flex items-center justify-center gap-3 border-2",
                    !videoUrl || isGenerating
                      ? "bg-transparent border-neutral-800 text-neutral-700 cursor-not-allowed pointer-events-none"
                      : "bg-white text-neutral-950 hover:bg-neutral-100 border-white active:scale-[0.98]"
                  )}
                >
                  <Download size={20} />
                  <span>MP4</span>
                </a>
              </div>
            </section>
          </div>
        </div>

        {/* Instructions Section */}
        <section className="mt-12 p-8 bg-neutral-900/30 border border-neutral-800 rounded-3xl backdrop-blur-sm">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Info size={20} className="text-indigo-400" />
            Как пользоваться
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold mb-2">1</div>
              <h4 className="font-semibold text-neutral-200">Загрузите фото</h4>
              <p className="text-sm text-neutral-500 leading-relaxed">Нажмите на плюс и выберите изображения. Вы можете менять их порядок, просто перетаскивая карточки.</p>
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold mb-2">2</div>
              <h4 className="font-semibold text-neutral-200">Настройте эффекты</h4>
              <p className="text-sm text-neutral-500 leading-relaxed">Выберите типы переходов, формат видео и фоновую музыку. Используйте ползунки для настройки времени.</p>
            </div>
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-sm font-bold mb-2">3</div>
              <h4 className="font-semibold text-neutral-200">Создайте и скачайте</h4>
              <p className="text-sm text-neutral-500 leading-relaxed">Нажмите "Создать Видео" и дождитесь окончания процесса. После этого вы сможете скачать результат в MP4 или WebM.</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-10 border-t border-neutral-900 flex flex-col md:flex-row items-center justify-between gap-6 text-neutral-600 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Film size={16} className="text-indigo-400" />
            </div>
            <span className="font-semibold text-neutral-400">Photo Collage Video Maker</span>
          </div>
          <p>© 2026 Создано для ваших лучших моментов.</p>
        </footer>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #262626;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #404040;
        }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: #6366f1;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid #fff;
        }
      `}</style>
    </div>
  );
}
