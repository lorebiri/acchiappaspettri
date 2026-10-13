# 👻 Acchiappaspettri

> C'è uno spettro nel tuo file? Lo acchiappiamo noi: lo scienziatino e Gino, il fantasma di fiducia.

A simple web tool for turning spectra and chromatograms saved as text files (FTIR/ATR-FTIR, Raman, UV-Vis, HPLC) into:

- a **PDF for quick review**, with several plots per page;
- a **folder of PNG images** at 600 dpi (16 × 10 cm by default), ready for theses and papers;
- optionally, a **peak list** and the **processed data** as CSV files for Excel.

Everything happens in the browser: the data never leave the computer of the person using the tool.

## The three steps

Each step opens with a "Qui puoi" (what you can do here) box that lists the available actions. A small scientist and Gino, his ghost, guide the user through the steps (click on Gino 😉).

### 1 · Carica (load)

- A loading panel shows progress («3 di 20: filename») while files are read.
- You can load single files, several files or a whole folder, by drag and drop or with the buttons.
- Accepted formats: `.txt` `.asc` `.csv` `.dat` `.dpt` `.prn` `.xy`.
- The instrument is detected automatically:
  - FTIR from the PerkinElmer `PE IR` header or from the IR range with %T/A values;
  - Raman from cm⁻¹ shift with counts;
  - HPLC from DAD/VWD in the file name, or from an x axis in minutes;
  - UV-Vis from a 150–1200 nm range.

### 2 · Controlla (review)

- **Display name** and **description** for each spectrum; the description appears under the plot title.
- **Peaks**:
  - detected automatically, with a "Quanti picchi?" (how many peaks) slider;
  - **click on the plot** to add a peak (it snaps to the nearest maximum or minimum);
  - **click on a peak** to remove it;
  - **click on a peak's number** to write an assignment, for example "C=O amide I".
- **X-axis range** for each file, for example the 1800–600 cm⁻¹ fingerprint region, with a button to apply it to every file from the same instrument.
- **Data processing**, set for each instrument:
  - %T ↔ absorbance conversion (A = 2 − log₁₀ %T) or 0–1 normalization;
  - automatic baseline correction (rubber band, good for fluorescence in Raman) or linear baseline;
  - Savitzky–Golay smoothing (light, medium or strong).
- **Large plot** (⛶ Grafico grande) that fills the screen, with **zoom** (mouse wheel or 🔍 buttons) and **pan** (drag), for placing peaks precisely. The zoom only affects the preview, not the output.
- **Cursor readout** of x and y while the mouse is over the plot.
- **Search** in the file list and checkboxes to exclude files from the output.
- Edits to each file (name, description, peaks, labels, range) are **remembered on that computer**: reloading the same file brings them back.

### 3 · Scarica (download)

- **Plot language**, Italian or English, covering axis labels, decimal separator, the summary page and the peak list.
- **Plots per page**: 1, 2, 4, 6 or 9, on A4 landscape or portrait.
- **Summary page** listing each sample with its description, instrument, X range and peaks, including any assignments.
- **Comparison pages** for each instrument, with spectra stacked with an offset or overlaid on the same scale, with a legend.
- **ZIP download** containing:
  - PNGs with the dpi written into the file metadata;
  - the peak list;
  - a CSV of processed data for each spectrum.
- **Saved settings**: named profiles that can be exported or imported as `.json` and shared with colleagues.

## Publishing on GitHub Pages

1. Create the `acchiappaspettri` repository on GitHub.
2. Upload `index.html` and `README.md`.
3. Open *Settings → Pages*, set *Source: Deploy from a branch*, then choose branch `main` and folder `/ (root)`, and click *Save*.
4. After about a minute the tool is online at `https://lorebiri.github.io/acchiappaspettri/`.

The PDF and ZIP libraries (jsPDF 2.5.1 and JSZip 3.10.1) load from cdnjs. If the institute network blocks them:

1. Download the two files into a `lib/` folder in the repository.
2. Change the two `<script src=…>` lines in `index.html` to point to those files.
