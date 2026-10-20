# 👻 Acchiappaspettri

> C'è uno spettro nel tuo file? Lo acchiappiamo noi: lo scienziatino e Gino, il fantasma di fiducia.

A simple web tool for turning spectra and chromatograms saved as text files (FTIR/ATR-FTIR, Raman, UV-Vis, fluorescence, HPLC, XRF, LIBS, TGA, DSC, NMR, EPR) into:

- a **PDF for quick review**, with several plots per page;
- a **folder of PNG images** at 600 dpi and, optionally, **vector SVG images**, with ready-made journal sizes;
- optionally, a **peak list** and the **processed data** as CSV files for Excel.

Everything happens in the browser: the data never leave the computer of the person using the tool.

## The three steps

On the first visit a welcome screen explains why the tool exists and what it does; «ℹ️ Cos'è» in the header shows it again.

In step 2 the tools sit under the plot in tabs named after what you want to do (Nome, Picchi, Ritocca lo spettro, Zona e strumento, Riferimenti, Aspetto e lingua). A coloured label on each option shows where it applies: green = only this spectrum, blue = every spectrum from the same instrument, yellow = all plots. A guided tour with Gino is offered the first time you open step 2. In step 3 you tick what you want (PDF, PNG images, peak list, processed data) and a single button downloads it. A small scientist and Gino, his ghost, guide the user through the steps (click on Gino 😉).

### 1 · Carica (load)

- A loading panel shows progress («3 di 20: filename») while files are read.
- You can load single files, several files or a whole folder, by drag and drop or with the buttons.
- Accepted formats: `.txt` `.asc` `.csv` `.dat` `.dpt` `.prn` `.xy`, plus `.sp` (PerkinElmer), and `.mca` `.spt` `.spe` for XRF.
- The instrument is detected automatically:
  - FTIR from the PerkinElmer `PE IR` header or from the IR range with %T/A values;
  - Raman from cm⁻¹ shift with counts;
  - HPLC from DAD/VWD in the file name, or from an x axis in minutes;
  - UV-Vis from a 150–1200 nm range;
  - XRF from Amptek/PMCA `.mca` files (`<<DATA>>`, `<<CALIBRATION>>`), LIDAQ `.spt` files (`[DATA]`, `[CALIBRATION]`), Maestro/ORTEC `.spe` files, or a single column of counts; the energy calibration, tube anode and kV are read from the header;
  - fluorescence from the PerkinElmer `PE FL` header (LS45/LS55), from fluorimeter names (FluoroMax, Fluorolog, Cary Eclipse, FS5) or from emission/excitation spectra in nm (`_em`, `_ex350` in the file name);
  - LIBS from the header (SciAps, Applied Spectra…) or from many narrow emission lines between 170 and 1100 nm;
  - TGA and DSC from tables with named columns (temperature, time, weight/mass or heat flow), or from a mass curve that falls with temperature:
    - mass in mg is converted to % of the initial mass;
    - temperature in K is converted to °C;
    - heat–cool–heat runs are split into segments, and the 2nd heating is shown by default;
  - NMR from TopSpin `totxt` exports (`# LEFT = … ppm`) or from headers with ppm; the nucleus is read from the header or the file name, or guessed from the ppm range;
  - EPR from a magnetic-field column (G, mT or T, always shown in mT) or from the header; the microwave frequency is read when present (`MWFQ`, «… GHz»); (`DATA TYPE`, `XUNITS`, `YUNITS`, instrument name) are read first, so JASCO exports (UV-Vis V-750, FT/IR, NRS Raman) and JCAMP-DX files are recognised from their header, including the instrument model.

### 2 · Controlla (review)

- **Display name** and **description** for each spectrum; the description appears under the plot title.
- **Peaks**:
  - detected automatically, with a "Quanti picchi?" (how many peaks) slider;
  - hovering highlights the peak under the cursor, or previews where a new peak would snap;
  - **click on a peak or its label** to open a small box next to it, where you can:
    - type the name and press Enter, choose one of the 💡 suggestions with one click, or remove the peak;
    - for a hand-written name, tick «Ricordalo nella mia libreria» (on by default for HPLC);
  - **click on an empty spot** to add a peak (it snaps to the nearest maximum or minimum) and select it;
  - **right-click a peak**, or press Delete on the selected peak, to remove it;
  - **Ctrl+Z** or ↶ undoes peak edits, with up to 60 steps per spectrum;
  - **peak table** with position, intensity, an editable name and the suggestions:
    - names can be typed one after another, since Enter or ↓ moves to the next peak;
    - hovering a row highlights that peak on the plot;
    - ⋯ opens all the options, including the XRF cross-check and the library;
  - **✓ Accetta i suggerimenti** puts the first suggestion on every unnamed peak in one click, and Ctrl+Z undoes it;
  - other buttons: «Rivedi i suggerimenti…», «Togli i nomi», «↺ Picchi automatici».
- **X-axis range** for each file, for example the 1800–600 cm⁻¹ fingerprint region, with a button to apply it to every file from the same instrument.
- **Peak-name database by sample type**: choose 🏛️ cultural heritage, 🧬 biological, ⚗️ organic & organometallic chemistry or 🧱 materials, polymers & catalysis, globally or per file. General functional groups are always proposed; names go on the plot only after the user approves them. A personal library adds your own bands or HPLC retention times.
- **Data processing**, set for each instrument:
  - %T ↔ absorbance conversion (A = 2 − log₁₀ %T) or 0–1 normalization;
  - automatic baseline correction (rubber band, good for fluorescence in Raman) or linear baseline;
  - Savitzky–Golay smoothing (light, medium or strong).
- **Large plot** (⛶ Grafico grande) that fills the screen, with **zoom** (mouse wheel or 🔍 buttons) and **pan** (drag), for placing peaks precisely. The zoom only affects the preview, not the output.
- **Enlarge a zone**:
  - with *⬚ Ingrandisci una zona* (or the `R` key), drag a rectangle over a detail with the mouse or a finger;
  - the preview zooms on that zone in both X and Y;
  - *📌 Metti l'ingrandimento nel grafico* keeps it as an **inset**: a magnified box placed inside the plot, with the selected rectangle outlined by a dashed line;
  - the inset also appears in the PDF and the PNG images;
  - it works for single spectra and for comparisons, is remembered for each file, and can be removed with *🗑️ Togli il riquadro*.
- **Cursor readout** of x and y while the mouse is over the plot.
- **Bulk rename** (✏️ Rinomina in the file list):
  - you write a name template with tokens:
    - `{n}` is a number taken from the file name, as written; you choose which one (1st, 2nd… or the last);
    - `{N}` is the same number without leading zeros, and `{n+10}`/`{n-1}` shift it;
    - `{i}` is a progressive count, in the order of that number or of the list;
    - `{nome}` is the file name, plus `{strumento}` and `{cartella}`;
    - `{elenco}` takes a line from a pasted list of real sample names, where line n goes to the file with number n, or the smallest number goes to line 1, or the list order is used;
  - an optional find and replace step (plain text or regular expression);
  - a live preview that marks duplicate names; files missing the number or the list line keep their current name;
  - one-click undo and «Nomi dei file» to go back to the original names;
  - the files on disk are never touched.
- **Search** in the file list and checkboxes to exclude files from the output.
- Edits to each file (name, description, peaks, labels, range) are **remembered on that computer**: reloading the same file brings them back.

### 3 · Scarica (download)

- **One download**: when several outputs are chosen, they arrive in a single ZIP with the PDF inside (option *Tutto in un unico file ZIP*, on by default). Browsers often block a second automatic download. After every export, the *File pronti* box keeps a button for each file, so a blocked file can be downloaded with one click.
- **Plot language**, Italian or English, covering axis labels, decimal separator, the summary page and the peak list.
- **Plots per page**: 1, 2, 4, 6 or 9, on A4 landscape or portrait.
- **Summary page** listing each sample with its description, instrument, X range and peaks, including any assignments.
- **Comparison pages** for each instrument, with spectra stacked with an offset or overlaid on the same scale, with a legend.
- **ZIP download** containing:
  - PNGs with the dpi written into the file metadata;
  - the peak list;
  - a CSV of processed data for each spectrum.
- **Saved settings**: named profiles that can be exported or imported as `.json` and shared with colleagues.
- **Excel workbook for Origin** (`.xlsx`). Origin's `.opj`/`.opju` project formats are closed, so they cannot be written outside Origin; this workbook is what Origin imports cleanly:
  - one sheet per spectrum, with X, Y and the DTG column for TGA;
  - for every instrument with 2 or more spectra, a «Tutti …» sheet with all the X/Y pairs side by side, ready for overlaid graphs;
  - a «Picchi» sheet with the peak list;
  - the first three rows are Long Name, Units and Comments, the comment being description, instrument, processing applied and file path;
  - the data can be as in the plot (with the processing) or the original file values.
  
  In Origin: *File → Open → Excel*, or drag the file in, then choose 3 header lines (Long Name, Units, Comments) and save the project as `.opju`.
- **Vector SVG images** (optional, in the ZIP). They are the same plots, drawn as vectors with real text, for journals, posters and Illustrator/Inkscape.
- **Ready-made sizes**: single column 8.5 × 6 cm, double column 17.5 × 10 cm, thesis 16 × 10 cm and slide 25 × 14 cm. The font size adapts to the chosen size.
- **Measurement information**: date, operator and instrument are read from the file headers when present and printed in the summary page. *Operatore / laboratorio* and *Progetto* fields go into the summary, the footer and the PDF properties.
- **Professional, neutral output**:
  - the PDF, PNG, CSV and ZIP files carry no tool name or mascot;
  - the PDF footer shows only the document title, date and page number;
  - the default document title is "Report spettri" / "Spectra report".

## Instrument-specific tools

Instrument parameters are set per spectrum in *Zona e strumento*. Calculated values appear in a small box on the plot, which can be switched off in *Picchi → Altre opzioni*.

| Instrument | What the tool adds |
|---|---|
| **LIBS** | Database of the strongest atomic lines (NIST, I/II) for about 50 elements, plus CN and C₂ bands. The ✓ mark and the cross-check list each element's other lines. Heritage and materials hints are included. The plot shows «elementi probabili» (elements with at least 2 lines); XRF gets the same list. |
| **TGA** | Mass %, DTG (−dm/dT) only, or mass + DTG on a right-hand axis. Peaks are the DTG maxima. The box shows T₅%, T₁₀%, residue and each step (range, DTG max, mass loss in %). The database covers typical degradation ranges: water, gypsum, cellulose, hemicellulose, lignin, common polymers and carbonates. |
| **DSC** | Peaks in both directions, called endo or exo according to the instrument convention (endo down / endo up), with a «Ribaltato» option to flip the plot. ΔH is calculated as area ÷ scan rate; the rate comes from the time column, the header or the user, and the result is in J/g with W/g or mW/mg data, or with mW plus the sample mass. A possible Tg (midpoint of a baseline step) is flagged «da verificare». The heating/cooling segment can be chosen. |
| **Fluorescence** | Fluorophore database (Trp, Tyr, NADH, fluorescein, rhodamine B…). From λex it recognises Rayleigh scattering (λex and 2·λex) and the water Raman band. A comparison of UV-Vis + fluorescence gives the **Stokes shift** (nm and cm⁻¹). |
| **NMR** | ppm axis decreasing to the right, with 2 decimals for ¹H and 1 for ¹³C. ¹³C and ¹H chemical-shift database, covering cellulose C1–C6, carbonyls, aromatics, biochar, urea, and residual solvent and water peaks. Areas work as integrals. |
| **EPR** | Each line is found as a positive/negative lobe pair, with its centre at the zero crossing and ΔBpp between the lobes. With the microwave frequency, g = 71.4477 · ν(GHz) / B(mT) is shown. The g-value database covers radicals, DPPH, char radicals, Mn²⁺, Cu²⁺, Fe³⁺ g≈4.3, VO²⁺, Ti³⁺… |

## Processing, difference spectra and references

- **Derivatives** (*Ritocca lo spettro*): first or second derivative, computed by local least-squares slope, so it also works with non-uniform spacing. The 2nd derivative turns overlapping bands into narrow peaks (downward), and peak detection follows them.
- **Logarithmic X axis**, for data spanning several decades, for example NMR relaxometry profiles.
- **Difference spectrum** (*Zona e strumento*):
  - sample − k × reference, where the reference is another loaded file from the same instrument;
  - %T spectra are subtracted in absorbance;
  - «Scala automatica» chooses k by least squares;
  - the plot description says what was subtracted.
- **Reference spectra** (*Riferimenti* tab):
  - a personal library saved on the computer, with 1200 points per spectrum; it can be exported and imported as `.json`, and filled from loaded spectra or from files;
  - for every spectrum the tab shows the most similar references, scored by the squared correlation of the shapes after removing a straight-line baseline (similar to the "hit quality index" of instrument software);
  - 👁 overlays a reference, dashed and with a legend, also in the PDF and the images;
  - the score is a help for identification, not a proof.

## Plot layout: nothing overlaps

The same layout engine is used for the preview, the PDF and the PNGs. It guarantees that peak labels, the legend and the inset never overlap.

- **Peak labels**:
  - labels are packed into separate columns, so they never touch each other;
  - each label starts above the curve in its column, never across it;
  - labels always stay inside the plot frame, so they never run into the title or the axes;
  - when there is not enough room, the data margin above the curve (below it for downward peaks such as %T) grows step by step, while the data always keep at least half of the plot height;
  - beyond that limit, long names are shortened with "…" and the peak number is always kept;
  - when there are more peaks than columns, the most important ones keep their text and the others keep only their tick mark.
- Peaks pointing up and peaks pointing down, as in DSC, get separate label columns above and below the curve.
- **Legend, calculated-values box and inset** go into a free corner or a free position along the top or bottom edge, away from the curve, the labels and the magnified zone. If no such position exists, they move to a column beside the plot.
- **Log axes** use 10³, 10⁴… tick labels.

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

## XRF spectra

- The **energy axis is in keV**, and the Y axis defaults to a **log scale** so that minor elements remain visible. You can switch to a linear scale under *Ritocca lo spettro*. In a comparison, overlaid XRF spectra also use the log scale.
- **Peak detection** runs on the Anscombe-transformed counts, 2√(y+3/8), which makes Poisson noise uniform across the spectrum. This lets a minor line next to a very strong one still be found. XRF files get about 1.7× the usual maximum number of peaks.
- **Line database**:
  - covers Kα, Kβ, Lα, Lβ, Lγ, Lℓ and Mα lines from Na to U (X-ray Data Booklet values);
  - each suggestion shows ✓ when the element's other lines are also present among the peaks (Kα↔Kβ, Lα↔Lβ…);
  - when two elements are close, for example As Kα and Pb Lα at 10.5 keV, the dialog lists the other lines of each candidate so you can decide which one fits;
  - with sample type *Beni culturali* each element carries pigment and alloy hints, for example Pb → lead white, minium, lead-tin yellow, or Hg → cinnabar.
- **Instrument artefacts** are suggested as well:
  - tube Rayleigh lines and the Compton peak (for Rh, Ag, Mo, Pd and W anodes);
  - Si escape peaks (−1.74 keV);
  - sum peaks;
  - argon from air.
- **Calibration alignment**:
  - many portable instruments drift by a few tens of eV;
  - *Zona e strumento → 🎯 Allinea sulle righe note* fits a small offset/gain correction using the strongest identified lines (Cu, Fe, Pb…) and reports the shift and residual;
  - it can be applied to all XRF files or undone;
  - peak labels follow the corrected axis.
- **Peak areas** are given in **net counts** (above the local background).
- Uncalibrated files are plotted against channel number, and no lines are suggested.

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

## Note on the new formats

The LIBS, TGA, DSC, fluorescence, NMR and EPR readers were tested on synthetic files that follow the common export formats: TA/Mettler-style TGA and DSC tables, PerkinElmer `PE FL`, TopSpin `totxt`, Bruker Xenon EPR tables and SciAps-style LIBS. Real exports from the institute's instruments may need small adjustments: if a file is not recognised, send it and it will be added.

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
