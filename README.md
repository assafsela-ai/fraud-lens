# Fraud Lens

An interactive fraud investigation demo. Follow one fictional case from a suspicious job offer and an equipment payment request to a report backed by evidence.

![Fraud Lens showing a WhatsApp chat beside selectable findings](./docs/preview.webp)

## Run the demo

**[Open the live demo](https://assafsela-ai.github.io/fraud-lens/)**

Open [index.html](./index.html) in your browser and select **Open the case**. The demo runs locally without an account, file uploads, or an API key.

You can also serve the repository over local HTTP.

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. To deploy with GitHub Pages, use the root folder of the `main` branch. The site is static and uses relative paths.

## Demo walkthrough

1. Open the fictional WhatsApp chat and select a finding to highlight it.
2. Read the follow-up messages about paying for equipment before onboarding.
3. Compare two versions of the same invoice and see what changed.
4. Open the receipt and select one of the three transfers to the receiving account.
5. Open the sources from the timeline, edit the summary, and select **Print or save as PDF**. Choose **Save as PDF** in your browser’s print dialog.

## How it works

- `case-data.js` contains the demo messages, invoice, transfers, and prepared chat findings.
- `app.js` compares invoice fields and groups transfers by receiving account. Edits to the report stay in memory while the page is open.
- Prepared chat findings illustrate what an AI-assisted review could show. All steps run in the browser. The people, documents, websites, and transactions are fictional.

The project uses the [MIT License](./LICENSE). The Heebo font uses the [SIL Open Font License](./assets/heebo-OFL.txt).
