"use client";

import { useEffect, useRef, useState } from "react";

import { SpeakerIcon, StopIcon } from "./icons";
import { pickBrazilianVoice } from "./speech";
import classes from "./voice.module.css";

// "Ouvir resposta" (§11.1): lê o texto da mensagem do agent com a síntese de voz do navegador,
// em pt-BR. Um clique fala, outro para. Sem `speechSynthesis` ou sem voz pt-BR, não aparece.

export function ListenButton({ text }: { text: string }) {
  const voice = useBrazilianVoice();
  const [speaking, setSpeaking] = useState(false);
  // Espelho de `speaking` para a limpeza: a mensagem que sai da tela só cala a própria fala.
  const isMine = useRef(false);

  useEffect(
    () => () => {
      if (isMine.current) window.speechSynthesis.cancel();
    },
    [],
  );

  if (!voice || text === "") return null;
  const chosenVoice = voice;

  function setMine(value: boolean) {
    isMine.current = value;
    setSpeaking(value);
  }

  function toggle() {
    const synth = window.speechSynthesis;
    synth.cancel(); // cala esta ou a fala de outra mensagem
    if (speaking) {
      setMine(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = chosenVoice;
    utterance.lang = chosenVoice.lang;
    utterance.onend = () => setMine(false);
    utterance.onerror = () => setMine(false);
    synth.speak(utterance);
    setMine(true);
  }

  return (
    <button type="button" className={classes.listen} aria-pressed={speaking} onClick={toggle}>
      {speaking ? <StopIcon size={12} /> : <SpeakerIcon size={13} />}
      {speaking ? "Parar" : "Ouvir resposta"}
    </button>
  );
}

/** A voz pt-BR do navegador. A lista chega depois do carregamento (`voiceschanged`). */
function useBrazilianVoice(): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const update = () => setVoice(pickBrazilianVoice(synth.getVoices()));
    update();
    synth.addEventListener("voiceschanged", update);
    return () => synth.removeEventListener("voiceschanged", update);
  }, []);

  return voice;
}
