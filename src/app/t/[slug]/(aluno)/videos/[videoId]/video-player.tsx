"use client";

import { useEffect, useRef, useState } from "react";
import { Chip } from "@/components/student-ui";
import { saveVideoProgressAction } from "../actions";

const EVERY_MS = 15_000;

/** Player que lembra onde o aluno parou e marca o vídeo como assistido. */
export function VideoPlayer({
  slug,
  videoId,
  src,
  startAt,
  alreadyWatched,
  track,
}: {
  slug: string;
  videoId: string;
  src: string;
  startAt: number;
  alreadyWatched: boolean;
  /** Equipe assiste sem registrar progresso. */
  track: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const last = useRef(0);
  const [watched, setWatched] = useState(alreadyWatched);

  async function save(ended = false) {
    const v = ref.current;
    if (!track || !v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    last.current = Date.now();
    const r = await saveVideoProgressAction(slug, videoId, ended ? v.duration : v.currentTime, v.duration, ended).catch(() => null);
    if (r?.completed) setWatched(true);
  }

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void save();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-[18px] bg-black">
        <video
          ref={ref}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          className="aspect-video w-full"
          src={src}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            // Retoma de onde parou (se não terminou); perto do fim, recomeça.
            if (!alreadyWatched && startAt > 5 && startAt < v.duration - 5) v.currentTime = startAt;
          }}
          onTimeUpdate={() => Date.now() - last.current > EVERY_MS && ref.current && !ref.current.paused && void save()}
          onPause={() => void save()}
          onEnded={() => void save(true)}
        >
          Seu navegador não consegue reproduzir este vídeo.
        </video>
      </div>
      {track && watched && (
        <div>
          <Chip tone="success" icon="checkCircle">Assistido</Chip>
        </div>
      )}
    </div>
  );
}
