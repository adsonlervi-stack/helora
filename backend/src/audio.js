import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Converte qualquer áudio gravado no navegador (webm/opus do Chrome, mp4/aac do Safari/iPhone)
 * para nota de voz do WhatsApp: ogg/opus, mono, 48 kHz.
 * Usa arquivos temporários (mp4 precisa de entrada "pulável") e corrige carimbos de tempo do webm,
 * que deixavam o áudio "com algo errado" no celular de quem recebia.
 *
 * @param {Buffer} inputBuffer
 * @returns {Promise<{ buffer: Buffer, seconds: number }>}
 */
export async function convertToOggOpusDetailed(inputBuffer) {
  const id = crypto.randomUUID();
  const src = path.join(os.tmpdir(), `in-${id}`);
  const dst = path.join(os.tmpdir(), `out-${id}.ogg`);
  await fs.writeFile(src, inputBuffer);
  try {
    let seconds = 0;
    await new Promise((resolve, reject) => {
      ffmpeg(src)
        .on("codecData", (d) => { const m = String(d?.duration || "").match(/(\d+):(\d+):(\d+)/); if (m) seconds = +m[1] * 3600 + +m[2] * 60 + +m[3]; })
        .on("progress", (p) => { const m = String(p?.timemark || "").match(/(\d+):(\d+):(\d+)/); if (m) seconds = Math.max(seconds, +m[1] * 3600 + +m[2] * 60 + +m[3]); })
        .inputOptions(["-fflags +genpts"])
        .outputOptions(["-vn", "-ac 1", "-ar 48000", "-c:a libopus", "-b:a 64k", "-application voip", "-avoid_negative_ts make_zero", "-map_metadata -1"])
        .format("ogg")
        .on("error", reject)
        .on("end", resolve)
        .save(dst);
    });
    const buffer = await fs.readFile(dst);
    if (buffer.length < 200) throw new Error("áudio vazio depois da conversão");
    return { buffer, seconds: Math.max(1, seconds) };
  } finally {
    fs.unlink(src).catch(() => {});
    fs.unlink(dst).catch(() => {});
  }
}

/** Compatível com o uso antigo: devolve só o buffer. */
export async function convertToOggOpus(inputBuffer) {
  return (await convertToOggOpusDetailed(inputBuffer)).buffer;
}
