# Avatar de vídeo (local e grátis)

Gera vídeos verticais (1080x1920) de ti a falar, prontos para o Instagram Reels e o YouTube Shorts.
Corre tudo no teu PC: não há assinaturas nem pagamentos.

## Como funciona

1. **Guião.** O Claude escreve o texto (por exemplo, `roteiros/supermercados-portugal.json`).
2. **Voz.** O teu clone de voz lê o texto.
3. **Imagem.** A ferramenta escolhe sozinha os melhores trechos dos teus vídeos reais: tu de frente, sem mãos à frente da boca, sem cortes nem B-roll. Depois corta-os para vertical, com a cara no terço de cima e cortes rápidos nas pausas, como numa edição normal.
4. **Boca.** O [LatentSync](https://github.com/bytedance/LatentSync) (ByteDance, open source) refaz só a zona da boca para acompanhar a voz nova. O corpo, as mãos, o fundo e a luz continuam a ser os do vídeo real.
5. **Final.** Legendas palavra a palavra, texto de gancho no início, áudio a -14 LUFS e MP4 H.264 + AAC.

O vídeo fica em `Ambiente de Trabalho\Videos Avatar\`, com um `.txt` ao lado que tem a legenda e as hashtags.

## Instalar (uma vez)

Precisas de:
- Windows 10 ou 11 com uma placa **NVIDIA de 8 GB ou mais**: com 16 GB ou mais fica muito melhor, porque usa o modelo de 512 px;
- cerca de 30 GB livres no disco;
- internet para os downloads.

Faz duplo clique em **`install.bat`**. O instalador:
- vê a tua placa e escolhe o modelo certo (LatentSync 1.6 ou 1.5);
- instala o ffmpeg, o Python e as bibliotecas;
- descarrega os modelos;
- no fim, faz um teste de 3 segundos e diz quanto tempo vai demorar cada vídeo.

Podes correr o instalador outra vez sem problema: só refaz o que faltar.

## Criar um vídeo

O mais fácil é abrir o Claude numa **sessão local** nesta pasta e pedir, por exemplo, *"faz um vídeo meu sobre X"*. As instruções para ele estão no `CLAUDE.md`.

À mão, numa janela de comandos aberta nesta pasta:

```bat
avatar.bat select --footage "C:\Users\ansel\Desktop\videos para clonar o meu avatar"
avatar.bat video --script roteiros\supermercados-portugal.json
```

- O `select` só é preciso uma vez, ou quando juntares vídeos novos à pasta. Cria uma imagem de pré-visualização com os trechos escolhidos, em `%LOCALAPPDATA%\AvatarAnselmo\work\footage_preview.jpg`.
- Se a voz ainda não estiver ligada (`tts_command`), gera o áudio à parte e junta `--audio caminho\voz.wav`.
- Para pôr uma música de fundo, que baixa sozinha quando falas, junta `--music musica.mp3`.
- Para evitar um trecho de que não gostes, usa `--exclude V1-S3`. Para usar só alguns, `--only V1-S1,V1-S4`.

## Para ficar mais realista

- Usa vídeos originais do telemóvel ou da câmara, não cópias descarregadas do YouTube (perdem qualidade).
- Boa luz na cara e câmara à altura dos olhos.
- Mexer as mãos não faz mal, desde que não passem à frente da boca. A ferramenta salta esses momentos sozinha.
- Quanto mais minutos de ti a falar no mesmo vídeo, menos trechos se repetem.
- Se a boca ficar desfocada, aumenta a qualidade: `avatar.bat config inference_steps=40`.
- Se a boca tremer, baixa a força: `avatar.bat config guidance_scale=1.3`.

## Regras das plataformas

O Instagram e o YouTube pedem que se marque conteúdo realista feito com IA. No YouTube é a opção "Conteúdo alterado ou sintético", ao carregar o vídeo; no Instagram é a etiqueta "IA". Usa esta ferramenta só com a tua cara e a tua voz.

## Licenças

- LatentSync: Apache-2.0.
- MediaPipe: Apache-2.0.
- Letra Montserrat: SIL OFL (`fonts/OFL.txt`).
- O LatentSync deteta a cara com os modelos `buffalo_l` do InsightFace, que, segundo o InsightFace, são só para investigação não comercial. Tem isto em conta se usares os vídeos para fins comerciais.
