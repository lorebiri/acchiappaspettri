# 👻 Acchiappaspettri

> C'è uno spettro nel tuo file? Lo acchiappiamo noi: lo scienziatino e Gino, il fantasma di fiducia.

A simple web tool for turning spectra and chromatograms saved as text files (FTIR/ATR-FTIR, Raman, UV-Vis, HPLC) into:

- a **PDF for quick review**, with several plots per page;
- a **folder of PNG images** at 600 dpi (16 × 10 cm by default), ready for theses and papers;
- optionally, a **peak list** and the **processed data** as CSV files for Excel.

Everything happens in the browser: the data never leave the computer of the person using the tool.

## The three steps

In step 2 the tools sit under the plot in tabs named after what you want to do (Nome, Picchi, Ritocca lo spettro, Zona e strumento, Aspetto e lingua). A coloured label on each option shows where it applies: green = only this spectrum, blue = every spectrum from the same instrument, yellow = all plots. A guided tour with Gino is offered the first time you open step 2. In step 3 you tick what you want (PDF, PNG images, peak list, processed data) and a single button downloads it. A small scientist and Gino, his ghost, guide the user through the steps (click on Gino 😉).

### 1 · Carica (load)

- A loading panel shows progress («3 di 20: filename») while files are read.
- You can load single files, several files or a whole folder, by drag and drop or with the buttons.
- Accepted formats: `.txt` `.asc` `.csv` `.dat` `.dpt` `.prn` `.xy`.
- The instrument is detected automatically:
  - FTIR from the PerkinElmer `PE IR` header or from the IR range with %T/A values;
  - Raman from cm⁻¹ shift with counts;
  - HPLC from DAD/VWD in the file name, or from an x axis in minutes;
  - UV-Vis from a 150–1200 nm range;
  - JCAMP-style header fields (`DATA TYPE`, `XUNITS`, `YUNITS`, instrument name) are read first, so JASCO exports (UV-Vis V-750, FT/IR, NRS Raman) and JCAMP-DX files are recognised from their header, including the instrument model.

### 2 · Controlla (review)

- **Display name** and **description** for each spectrum; the description appears under the plot title.
- **Peaks**:
  - detected automatically, with a "Quanti picchi?" (how many peaks) slider;
  - **click on the plot** to add a peak (it snaps to the nearest maximum or minimum);
  - **click on a peak** to remove it;
  - **click on a peak's number** to write an assignment, for example "C=O amide I".
- **X-axis range** for each file, for example the 1800–600 cm⁻¹ fingerprint region, with a button to apply it to every file from the same instrument.
- **Peak-name database by sample type**: choose 🏛️ cultural heritage, 🧬 biological, ⚗️ organic & organometallic chemistry or 🧱 materials, polymers & catalysis, globally or per file. General functional groups are always proposed; names go on the plot only after the user approves them. A personal library adds your own bands or HPLC retention times.
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

## Automatic peak detection: how it works and how it was validated

How it works:
1. The noise is estimated robustly, from the median absolute deviation of the second differences.
2. The width of the clearest peaks is measured, and Savitzky–Golay smoothing is set to about 0.6 × the width of the narrowest one. This way narrow peaks are not flattened.
3. For every local maximum the prominence is calculated, meaning how much it stands out from its surroundings, which makes it independent of the baseline. A peak is kept if its prominence is at least 8 × the noise and at least the chosen sensitivity percentage of the most prominent peak.
4. The position is refined with a parabolic fit. The spectrum edges, where smoothing cannot work, are excluded.

Validation (`node test/peak-benchmark.js`): 200 synthetic spectra per technique and per slider setting, with known peaks. The cases cover FTIR in absorbance and %T, Raman with strong fluorescence, HPLC with peaks ranging from 1 to 100, and UV-Vis, with random noise, baselines, widths and overlaps. A peak *must* be found if it stands out at least 6 × the noise and at least max(3 %, 1.3 × sensitivity) of the most prominent peak.

| Sensitivity | Peaks found | Reported peaks that are real | Perfect spectra |
|---|---|---|---|
| 3 | 100 % | 99.8–100 % | 799/800 |
| 5 (default) | 100 % | 100 % | 800/800 |
| 10 | 100 % | 100 % | 800/800 |

Median position error is under 1 % of the peak width. Limits: shoulders with no local maximum, and peaks merged with a neighbour, cannot be told apart by this method. You can add them by clicking on the plot.

## Overlaying spectra (comparisons)

At the top of step 2 you choose between **«Un grafico alla volta»** (one plot at a time) and **«Confronta grafici»** (compare plots).

In **Confronta grafici** mode:
- **Choosing spectra:** in the list on the left you tick the spectra to overlay. Only spectra from the same instrument can be combined, so the others are greyed out. The first tick creates the comparison automatically, and the «Uno per ogni strumento» button creates one comparison per instrument in a single click.
- **Named comparisons:** you can make as many as you like, each with a name that becomes the plot title. You switch between them with the chips at the top or the ◀ ▶ arrows.
- **Overlay mode:** three options.
  - *Stessa scala* (same scale): real intensities.
  - *Sfalsati* (offset): each spectrum normalised and stacked one above the other, with adjustable spacing.
  - *Normalizzati* (normalised): all between 0 and 1, on top of each other.
- **Mixed units:** if %T and absorbance spectra are mixed, in the normalised modes the peaks are all turned the same way. In «Stessa scala» a warning is shown.
- **Reading the plot:** zoom, pan and the large plot work as in the single view. Moving the mouse over the plot tells you which spectrum is closest. Comparisons are remembered on that computer.

In step 3:
- **PDF:** comparison pages go at the start or at the end, or can be left out.
- **PNG:** comparisons also come out as images, in the `confronto/` subfolder of the ZIP.
- **Excluding one:** to leave a single comparison out of the output, untick «Mettilo anche nel PDF e nelle immagini» («also put it in the PDF and images»).

## Peak area (for quick comparison, not validated quantitation)

The **📐 Area dei picchi** option, in the Picchi tab, shows area and area % for every peak. When it is on, it also shades the integrated zones on the plots and adds area, area % and integration limits to the CSV peak list.

How it is calculated:
- **Limits:** set automatically where the signal returns to its own baseline, or at the valley shared with a neighbouring peak, up to a maximum of 6 FWHM per side.
- **Baseline:** a straight line between the limits (valley to valley). If that line would cut through the signal, it follows the signal from below instead.
- **Integration:** trapezoidal, on the data.
- **%T spectra:** the area is calculated in absorbance.

Validation (`node test/area-benchmark.js`, about 750 peaks of known area per case):

| Case | Median error | 90 % of peaks within |
|---|---|---|
| Gaussian, sloped baseline, 0.5 % noise | −0.1 % | ±2.6 % |
| Gaussian, 2 % noise | +1.4 % | ±8 % |
| Gaussian, curved baseline | +1.7 % | ±14 % |
| Close Gaussians (≥ 2 FWHM) | −0.3 % | ±3 % |
| Pseudo-Voigt | −13 % | ±20 % |
| Lorentzian (long tails) | −19 % | ±27 % |

As in the software on the instruments, peaks with long tails are underestimated because the part of the tail beyond the limits is lost. Strongly overlapping peaks are split at the valley. For official results use the instrument software.

## Author

Idea by **Lorenzo Birindelli** (CNR-ICCOM, Pisa). For ideas or criticism: [lorenzo.birindelli@cnr.it](mailto:lorenzo.birindelli@cnr.it).

## Publishing on GitHub Pages

1. Create the `acchiappaspettri` repository on GitHub.
2. Upload `index.html`, `README.md`, `apple-touch-icon.png` and the `test/` folder.
3. Open *Settings → Pages*, set *Source: Deploy from a branch*, then choose branch `main` and folder `/ (root)`, and click *Save*.
4. After about a minute the tool is online at `https://lorebiri.github.io/acchiappaspettri/`.

The PDF and ZIP libraries (jsPDF 2.5.1 and JSZip 3.10.1) load from cdnjs. If the institute network blocks them:

1. Download the two files into a `lib/` folder in the repository.
2. Change the two `<script src=…>` lines in `index.html` to point to those files.
