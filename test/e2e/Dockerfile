FROM mcr.microsoft.com/playwright:v1.55.1-noble

WORKDIR /tests

COPY . /tests

# Google Chrome, not the bundled Chromium: the scrcpy screen stream is H.264,
# which only a build with proprietary codecs decodes (WebCodecs)
RUN npm ci && npx playwright install --with-deps chromium chrome

# Show help by default.
CMD ["npx", "playwright", "tests"]
