## Render deploy (single web service)
## - Builds React client
## - Runs Express API
## - Includes TeX Live so LaTeX -> PDF works in production

FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json server/package-lock.json* ./server/
COPY client/package.json client/package-lock.json* ./client/

RUN npm install --prefix server
RUN npm install --prefix client

COPY server ./server
COPY client ./client

RUN npm run build --prefix client

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# TeX Live: keep it reasonable but include common LaTeX packages.
# fontawesome.sty is provided by texlive-fonts-extra on Debian.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-xetex \
    texlive-luatex \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

WORKDIR /app/server
RUN npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["node", "index.js"]

