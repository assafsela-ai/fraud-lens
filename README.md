# Fraud Lens

Fraud Lens reviews suspicious-message screenshots with OpenAI. It also includes an interactive English demo that follows one fictional job scam from the first message to an evidence report.

![Fraud Lens showing a WhatsApp chat beside selectable findings](./docs/preview.webp)

## Run the demo

**[Open the live demo](https://assafsela-ai.github.io/fraud-lens/)**

Open [index.html](./index.html) in your browser and select **Open the case**. The demo runs locally without an account, file uploads, or an API key.

You can also serve the repository over local HTTP.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. To deploy with GitHub Pages, use the root folder of the `main` branch. The site is static and uses relative paths.

## Analyze your own screenshot

Run the local analyzer with **Node.js 22 or later**. It uses Node’s built-in APIs and needs no package installation.

```sh
git clone https://github.com/assafsela-ai/fraud-lens.git
cd fraud-lens
npm start
```

Open [the local analyzer](http://127.0.0.1:8787/analyze.html), choose a PNG, JPEG, or WebP screenshot (up to 10 MB), enter your OpenAI API key, and select a model. The result includes a risk assessment, supporting evidence, next steps, and what the screenshot could not establish. Access and costs depend on your OpenAI project.

The browser sends the key and image to the local Fraud Lens server for that request. The server forwards them directly to OpenAI’s Responses API. Fraud Lens clears the key field on submission and does not log or save keys, images, or results. The image may contain personal details, so crop any material you do not need reviewed. OpenAI handles submitted data under its [API data controls](https://developers.openai.com/api/docs/guides/your-data).

GitHub Pages hosts the signup-free fictional case and the analyzer setup page. Live OpenAI analysis runs through the local server. The server listens on `127.0.0.1`; set `FRAUD_LENS_PORT` if the default port is occupied.

## Demo walkthrough

1. Open the fictional WhatsApp chat and select a finding to highlight it.
2. Read the follow-up messages about paying for equipment before onboarding.
3. Compare two versions of the same invoice and see what changed.
4. Open the receipt and select one of the three transfers to the receiving account.
5. Open the sources from the timeline, edit the summary, and select **Print or save as PDF**. Choose **Save as PDF** in your browser’s print dialog.

## How it works

- `case-data.js` contains the demo messages, invoice, transfers, and prepared chat findings.
- `app.js` compares invoice fields and groups transfers by receiving account. Edits to the report stay in memory while the page is open.
- Prepared chat findings illustrate what an AI-assisted review could show. All five demo steps run in the browser, and all case data is fictional.
- `analysis-ui.js` handles the analyzer form and renders results as text. `image-worker.js` prepares screenshots in a Web Worker so the page stays responsive.
- `analysis/server.mjs` handles local requests. `analysis/openai.mjs` owns the model list, the OpenAI request, and the result validation.

Run `npm test` to check the analyzer contracts with simulated API responses. Keep source files at 600 lines or fewer.

The project uses the [MIT License](./LICENSE). The Heebo font uses the [SIL Open Font License](./assets/heebo-OFL.txt).
