import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Converte um áudio gravado no navegador (webm/opus, o formato que o
 * MediaRecorder produz) para ogg/opus — o formato exigido pelo WhatsApp
 * pra tratar a mensagem como nota de voz (com onda sonora), não como
 * arquivo de música anexado.
 *
 * O áudio (opus) não precisa ser recodificado, só trocado de "caixa"
 * (container webm -> ogg), por isso é rápido.
 *
 * @param {Buffer} inputBuffer - áudio original (webm/opus)
 * @returns {Promise<Buffer>} áudio convertido (ogg/opus)
 */
export function convertToOggOpus(inputBuffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const input = new PassThrough();
    input.end(inputBuffer);

    ffmpeg(input)
      .inputFormat("webm")
      .audioCodec("libopus")
      .format("ogg")
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)))
      .pipe()
      .on("data", (chunk) => chunks.push(chunk))
      .on("error", reject);
  });
}
