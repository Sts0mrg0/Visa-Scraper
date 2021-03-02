# Visa-Scraper
Visa scraper bot for nodejs

Google spreadsheets list to NOSQL hash, diffs page changes and sending page snapshots to messengers

## How to install and run

1. Run `npm install` to install the Node.js dependencies, including Chromium (beware, 355Mb)
2. Edit main.js and change googleSheetId to your Google Spreadsheet document (see [g-sheets-api manual](https://github.com/bpk68/g-sheets-api) how to properly publish your Google Spreadsheet)
3. Run `npm start` to run the script. First run is building the database.
4. The second and following runs will make a PNG snapshots for any change.

