# Aponta

Assista o seu vídeo do HyperFrames direto do código, sem render. Viu um erro? Circule no quadro, escreva uma linha, e o Claude corrige. A página recarrega sozinha no mesmo quadro, e você só renderiza uma vez, no final.

## Instalar

Cole isto no Claude Code (em qualquer pasta):

```
Instala o Aponta pra mim: https://github.com/alisonnnfreitasss/aponta
Baixa na minha pasta Documentos, segue as instruções do CLAUDE.md de lá e me avisa quando estiver pronto.
```

O Claude baixa o Aponta, confere se o seu computador tem o que precisa, instala o que faltar (perguntando antes) e deixa tudo pronto. Você não digita nenhum comando. Funciona no Windows e no Mac.

> Claude Code: as instruções de instalação estão em `CLAUDE.md`.

## Usar

No Claude Code, dentro da pasta do seu vídeo:

1. **"abre o Aponta nesse vídeo"**: a página abre no navegador e o vídeo toca direto do código.
2. Ande quadro a quadro com as setas, desenhe em cima do que está errado (caneta, caixa, seta ou pino), escreva uma linha e aperte Enter. A nota guarda o tempo, o número do quadro e uma foto do que você marcou.
3. Clique em **"Mandar para o Claude"** e cole no Claude Code. Ele lê cada nota com a foto, corrige o código, e a página recarrega no mesmo quadro.
4. Na aba **Conferir**: "Ficou bom" ou "Ainda não".
5. Quando estiver tudo certo, peça o render.

Atalhos: Espaço toca e pausa, setas andam um quadro, Shift + setas um segundo, Esc limpa o desenho.

## O que precisa

- Node.js 18 ou mais novo (quem usa HyperFrames já tem).
- Chrome ou Edge (o Windows já vem com o Edge).
- ffmpeg, só para notas em vídeos já renderizados (.mp4).

## Bom saber

- As notas ficam numa pasta `.aponta` dentro do projeto do vídeo.
- A página só funciona no seu computador (endereço 127.0.0.1).
- Um clipe num formato que o navegador não toca (HEVC com transparência, ProRes) aparece preto aqui. Nesse caso, use o HyperFrames Studio ou um render.
- Se o HyperFrames Studio estiver aberto ao mesmo tempo, o Desfazer dele também desfaz as correções do Claude.

Usa o player e o runtime do [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0), instalados pelo npm.
