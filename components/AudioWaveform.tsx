"use client";

import React, { useEffect, useState } from "react";

interface AudioWaveformProps {
  isListening: boolean;
  barCount?: number;
  height?: number;
  color?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  isListening,
  barCount = 28,
  height = 48,
  color = "bg-purple-500",
}) => {
  const [heights, setHeights] = useState<number[]>([]);

  useEffect(() => {
    if (!isListening) {
      setHeights(Array(barCount).fill(6));
      return;
    }

    const interval = setInterval(() => {
      const newHeights = Array.from({ length: barCount }, () =>
        Math.floor(Math.random() * (height - 8) + 8)
      );
      setHeights(newHeights);
    }, 90);

    return () => clearInterval(interval);
  }, [isListening, barCount, height]);

  return (
    <div
      className="flex items-center justify-center gap-1 overflow-hidden"
      style={{ height: `${height}px` }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-75 ${
            isListening ? color : "bg-slate-700/60"
          }`}
          style={{
            height: `${h}px`,
            opacity: isListening ? 0.3 + (h / height) * 0.7 : 0.4,
          }}
        />
      ))}
    </div>
  );
};
