# 👻 Acchiappaspettri

> C'è uno spettro nel tuo file? Lo acchiappiamo noi: lo scienziatino e Gino, il fantasma di fiducia.

A simple web tool for turning spectra and chromatograms saved as text files (FTIR/ATR-FTIR, Raman, UV-Vis, fluorescence, HPLC, XRF, LIBS, TGA, DSC, NMR, EPR) into:

- a **PDF for quick review**, with several plots per page;
- a **folder of PNG images** at 600 dpi and, optionally, **vector SVG images**, with ready-made journal sizes;
- optionally, a **peak list** and the **processed data** as CSV files for Excel;
- an **analysis assistant** for qualitative and quantitative work: data-quality checks with one-click remedies, hypotheses on what the sample contains, band deconvolution with uncertainties, technique-specific figures of merit, calibration lines with LOD/LOQ, PCA and clustering, mixture analysis, and a draft *Methods* paragraph with references.

Everything happens in the browser: the data never leave the computer of the person using the tool.

## The three steps

On the first visit a welcome screen explains why the tool exists and what it does; «ℹ️ Cos'è» in the header shows it again.

In step 2 the tools sit in five tabs named after what you want to do (Picchi, Ritocca lo spettro, Dati dello spettro — name, description, range, instrument —, Riferimenti, Analisi, which also contains the multi-sample tools). On screens at least 1280 px wide the step uses three columns: the spectrum list and the plot stay in view while the tools scroll on their own on the right; narrower screens keep the stacked layout. Plot colours, line width and grid are set in step 3. A coloured label on each option shows where it applies: green = only this spectrum, blue = every spectrum from the same instrument, yellow = all plots. A guided tour with Gino is offered the first time you open step 2. In step 3 you tick what you want (PDF, PNG images, peak list, processed data) and a single button downloads it. A small scientist and Gino, his ghost, guide the user through the steps (click on Gino 😉).

### 1 · Carica (load)

- A loading panel shows progress («3 di 20: filename») while files are read.
- You can load single files, several files or a whole folder, by drag and drop or with the buttons.
- Accepted formats: `.txt` `.asc` `.csv` `.dat` `.dpt` `.prn` `.xy`, plus `.sp` (PerkinElmer), `.mca` `.spt` `.spe` for XRF, **JCAMP-DX** `.jdx` `.dx` (plain and compressed: SQZ, DIF, DUP; `(X++(Y..Y))` and `(XY..XY)`), **Thermo OMNIC** `.spa` and **Bruker OPUS** `.0`, `.1`… (absorbance block, otherwise the sample spectrum). The `.spa` and OPUS readers follow the published file layouts and are tested on files built to those layouts (`test/format-test.js`), not yet on files from the instruments: if one is not read, send it.
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
  - baseline correction: rubber band, **arPLS** (asymmetrically reweighted penalised least squares, Baek et al. 2015, which follows curved backgrounds such as fluorescence in Raman), **SNIP** for XRF and LIBS counts (Ryan et al. 1988, with LLS transform and decreasing window, Morháč et al. 1997), or linear;
  - **cosmic-ray removal** for Raman, fluorescence and generic CCD data (modified z-scores of first differences, Whitaker & Hayes 2018): only narrow (1–3 point) isolated spikes are replaced;
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

## Tested on real data

Besides the synthetic benchmarks, the tool was run on spectra from the institute's instruments:

- **XRF** (LIDAQ `.spt` and `.mca`, Rh tube, 4096 channels): calibration off by 45–49 eV detected and corrected; elements Ag, Cu, Pb in a metal reliquary; Pb, Ca, Ba, Cu, As in a green paint layer, with the Pb Lα/As Kα and Ba Lα/Ti Kα overlaps flagged and Cu + As → emerald/Scheele's green proposed.
- **HPLC** (plain CSV, 33 000 points, 55 min): recognised from the time axis; seven peaks with plate number, tailing, resolution and S/N.
- **FTIR** (PerkinElmer `.ASC`, %T): protein material recognised from amide I/II; secondary structure computed.
- **Raman** (1800–700 cm⁻¹ text files with strong fluorescence): carotenoids recognised (1522, 1153, 1004 cm⁻¹) after arPLS; with sample type *biologico* the recipes become «Riconosci le molecole» and «Confronta i campioni» (ready-made carotenoid ν₁/CH₂ ratio), and the pigment finder steps aside.

## Made for everyone

- **Messages where you are looking**: when Gino's speech bubble is out of view, the same message appears briefly at the bottom of the screen; changes that apply to every spectrum of an instrument say so («Applicato a tutti i 7 spettri FTIR»).
- **Analysis in collapsible sections**, each with a one-line summary («⚠️ 1 avviso», «verde smeraldo o di Scheele», «4 componenti · R² 0,998»); when you move to another spectrum, only the sections with something to show open by themselves.
- **◐ Sobrio** in the header hides the mascot, confetti and emoji (✓ and ✗ stay), for a more formal look.
- **Short guided tour** (7 steps) whose highlight follows the element even when the page scrolls.

- **«Cosa vuoi fare con questo spettro?»**: at the top of the *Analisi* tab, one-click recipes for the most common tasks of each technique (e.g. *Riconosci il pigmento* for Raman: removes cosmic rays and background and searches the pigment database; *Riconosci elementi e pigmenti* for XRF: aligns the energy scale and asks the colour of the measured spot; *Quanto è degradato?* for FTIR: carbonyl index).
- **Simple mode by default**: technical choices (fit profile and baseline, PCA scaling, internal-standard ratio, derivatives, log X…) are hidden and the recommended settings are used; *⚙️ Opzioni avanzate* shows them.
- **«?» next to technical words** (baseline, deconvolution, LOD/LOQ, PCA, S/N, mixtures, false colour…) opens a plain-language explanation.
- **🔠 Aa** in the header makes all text larger (100 %, 115 %, 130 %), remembered on that computer.
- **Right-click menu on the plot**: on a peak — name it, accept the suggestion, remove it, deconvolve the bands around it, measure that band on all spectra, use it as the NMR integral reference, zoom; on an empty spot — add a peak, undo, deconvolve or measure the visible zone, zoom, show all, copy the coordinates, download this plot as PNG. Arrow keys, Enter and Esc work. Shift+click or Delete still remove a peak at once.

## Cultural heritage

- **Raman pigment finder**: a database of 48 pigments and minerals (whites, yellows, reds, blues, greens, blacks, alteration products such as oxalates, atacamite and brochantite) from Bell, Clark & Gibbs (1997), Burgio & Clark (2001) and Caggiani et al. (2016). The main band must be present; the other bands weigh less and less; bands outside the measured range are not counted. Each candidate shows the bands found and missing and, when relevant, **since when the pigment exists** (Prussian blue 1704, cobalt blue 1802, emerald green 1814, artificial ultramarine 1828, zinc white 1834, cadmium yellow ~1840, titanium white ~1920, phthalocyanines 1935…), useful to spot retouching and forgeries.
- **XRF**:
  - the assistant checks the **energy calibration** on the strongest known lines and, if it is off by more than 25 eV, proposes *🎯 Allinea*; on the two example spectra (LIDAQ `.spt` and `.mca`, Rh tube) the shift was 45–49 eV, and without alignment argon (2.96 keV) was mistaken for palladium;
  - an element is declared present only with its main line (Kα or Lα) plus a second line, or a strong main line; M lines alone are not enough;
  - **overlapping lines** are flagged (e.g. Pb Lα + As Kα at 10.5 keV, Ba Lα + Ti Kα at 4.5 keV);
  - choosing the **colour of the measured spot** narrows the pigment hypotheses (e.g. green + Cu + As → emerald or Scheele's green; blue with no heavy element → ultramarine or indigo, to check with Raman; red with no heavy element → organic lake);
  - **composition in weight %** with standards (*Analisi → Più campioni*, or the recipe *Composizione in %*): net line areas in a ±1 FWHM window (silicon-detector resolution model), SNIP background, normalisation to the Compton peak, one calibration per element — linear, or with the **Lucas-Tooth & Price** inter-element correction when there are enough standards —, optional normalisation to 100 % for alloys, uncertainties from leave-one-out cross-validation, as in the CHARM protocols for copper alloys (Heginbotham et al. 2010, 2015). On simulated Cu–Zn–Sn–Pb alloys with matrix effects and 12 standards the median error is 0.47 % (Cu), 0.18 % (Zn), 0.15 % (Sn), 0.12 % (Pb) by weight, against 3.7 % for Cu with straight lines. Without standards only relative comparisons are given;
  - ready-made ratios in *Più campioni*: element / **Compton** (normalisation for distance and geometry) for Pb, Cu, Fe, Ca, Hg, Zn, Au, Ag, Sn, **Pb Lα/Lβ** (depth of the lead layer), Cu/Zn (alloys).
- **🖼️ Falso colore** (step 1, «Componi i falsi colori»; and whenever photos are loaded together with spectra, the tool asks whether to compose false colours and guesses from the file names which photo is visible, infrared or ultraviolet): from photos in the visible, reflected infrared and reflected ultraviolet of the same detail, builds **infrared false colour** (IR → red, red → green, green → blue), **ultraviolet false colour** (green → red, blue → green, UV → blue), the **IR image over the visible** with a slider (underdrawings) and the single bands. Images are aligned automatically (edge correlation, shift and scale), clicking a point reads its colour and the closest pigment in a legend of typical IRFC appearances (Moon et al. 1992; Aldrovandi et al. 2005; Cosentino 2014), always to be confirmed with XRF or Raman. The result can be saved as PNG; nothing leaves the computer.

## Analysis assistant (🔬 Analisi tab)

Everything below is computed in the browser, on the spectrum as processed in *Ritocca lo spettro*.

**Data-quality check.** For each spectrum the assistant reports, with the reason and, when there is one, a one-click remedy:
- signal-to-noise ratio and whether it is enough to quantify (S/N ≥ 10, ICH Q2); the noise is estimated also on sub-sampled data, because instruments that filter or oversample (HPLC detectors) produce correlated noise that second differences underestimate — on a real 33 000-point chromatogram the S/N went from an impossible 2.9 million to about 150 000, matching the Ph. Eur. 2H/h value;
- detector saturation (flat-topped maximum), absorbance above ~1.5 in UV-Vis (stray light, Beer–Lambert non-linearity), saturated FTIR bands (T < 1%), negative absorbance;
- a large background (→ *Applica arPLS* / *SNIP*), cosmic rays (→ *Togli i raggi cosmici*), too few points per peak width, irregular X step;
- hidden bands (shoulders) seen in the second derivative (→ *Deconvolvi*);
- HPLC peak pairs with Rs < 1.5 and tailing factors > 2 (USP <621>); TGA mass loss below 150 °C; missing DSC scan rate or EPR frequency; inner-filter reminder for fluorescence.

**What could be there (qualitative hypotheses).**
- FTIR and Raman: about 45 rules of characteristic band combinations (Socrates 2001; Larkin 2011): esters, acids, carboxylates and metal soaps, amides/proteins, alcohols, aliphatic chains, aromatics, nitriles, nitro, sulfonates, metal carbonyls, water, atmospheric CO₂, carbonates, sulfates, oxalates, silicates, phosphates, nitrates, polysaccharides, drying oils, silicones, urethanes; calcite, aragonite, gypsum, anatase, rutile, hematite, quartz, cinnabar, lead white, lazurite, carotenoids, carbon D/G bands… A hypothesis appears only if all required bands are present; diagnostic bands must also be among the strong ones (≥ 20% of the most prominent peak), and shoulders from the second derivative count as confirmations. Each hypothesis shows the bands found (✓) and missing (✗).
- XRF and LIBS: elements with at least two identified lines are combined into material/pigment hypotheses, with dating hints where relevant (e.g. titanium white from ~1920, zinc white from 1834, Scheele's/emerald green, cadmium pigments; Eastaugh et al. 2008).
- These are hints, not identifications.

**Band deconvolution.** Pseudo-Voigt components (Gaussian + Lorentzian, Wertheim et al. 1974) on a constant, linear or quadratic baseline, fitted by Levenberg–Marquardt with analytic derivatives. Results: centre, FWHM, height, area, area % and Lorentzian fraction, each with its **standard error** from the covariance matrix, R² and the ratio between residual RMS and noise; values are rounded to the precision of their uncertainty. In automatic mode the seeds come from the second-derivative minima (Maddams & Mead 1982) and the detected peaks; duplicates are merged, non-significant components (area < 2σ, height < 3σ of noise) pruned, and the number of components is chosen by backward elimination and residual-guided addition with the BIC (Schwarz 1978), accepting an extra component only for ΔBIC > 6. %T spectra are fitted in absorbance. Components and their sum can be drawn on the plot, also in the PDF, PNG and SVG; *📍 Usa i centri come picchi* turns the centres into peaks.

**Technique-specific quantities.**

| Instrument | What is computed |
|---|---|
| **HPLC** | retention time, height, W½, plate number N = 5.54 (tR/W½)², USP tailing factor (W₀.₀₅/2f), asymmetry (b/a at 10%), resolution Rs = 1.18 Δt/(W½,1+W½,2), retention factor k with t₀, S/N (USP <621>, Ph. Eur. 2.2.46); in gradient elution N is inflated and is only good for comparing runs of the same method |
| **DSC** | extrapolated onset and endset (tangent at the steepest point of each flank, ISO 11357-1) with ΔH |
| **TGA** | onset and endset of each step (plateau tangents vs. tangent at the DTG maximum, ISO 11358-1) and mass loss |
| **UV-Vis** | optical band gap from Tauc plots, direct or indirect transitions, absorbance or diffuse reflectance (Kubelka–Munk); the steepest linear segment is extrapolated to the sub-gap tail as recommended by Makuła et al. (2018) |
| **EPR** | double integral of the derivative spectrum and relative spin amounts across all loaded EPR spectra |
| **NMR** | relative integrals referenced to a chosen signal and its number of nuclei (qNMR) |
| **XRF** | net counts, Poisson uncertainty and Currie (1968) decision and detection limits for every line: detected / doubtful / not detected |
| **Raman** | I(D)/I(G) from heights and from a Lorentzian fit; crystallite size La from the laser wavelength (Cançado et al. 2006) |
| **FTIR (proteins)** | when amide I and II are present: secondary structure from the amide I band (1600–1700 cm⁻¹), components located by the second derivative, Gaussian fit, assignment to β-sheet, random coil, α-helix, turns and antiparallel β/aggregates (Byler & Susi 1986; Barth 2007); useful for proteins, wool, silk, collagen and protein binders |
| **Fluorescence** | relative quantum yield against a loaded standard (Brouwer 2011, IUPAC) |

## Several samples (📊 Più campioni tab)

- **Band measurement on all spectra** of one instrument: height, area, value at one point, centroid or FWHM of a band, optionally as a ratio to a reference band (internal standard). Ready-made indices from the literature: carbonyl index (SAUB, Almond et al. 2020), cellulose LOI and TCI crystallinity indices (Nelson & O'Connor 1964), amide I/II, ester/carboxylate, Raman I(D)/I(G), A260/A280.
- **Calibration line**: type the concentration of the standards; with three or more, ordinary least squares gives slope and intercept with 95% confidence intervals, s_y/x, **LOD = 3.3 s/b and LOQ = 10 s/b** (ICH Q2(R2)), standardised residuals with outlier flags, **Mandel's linearity test** (from five standards, ISO 8466-1), and the concentration of every unknown with its 95% confidence interval (Miller & Miller), flagged when extrapolated or below the LOQ. The plot shows standards, unknowns, the line and its confidence band.
- **PCA and clustering**: spectra interpolated on their common range (or on the band), pre-treated with SNV (Barnes et al. 1989), MSC (Geladi et al. 1985) or first/second derivative, mean-centred, autoscaled or Pareto-scaled; NIPALS PCA with explained variance, score plot with the 95% Hotelling T² ellipse, loadings, and Ward hierarchical clustering with a dendrogram and a suggested number of groups.
- **PLS calibration** (*Modello di taratura → tutto lo spettro, PLS*): PLS1 regression (NIPALS; Wold et al. 2001) on the pre-treated spectra, with the number of latent variables chosen by leave-one-out cross-validation; reports R², Q², RMSEC and RMSECV, and predicts the unknowns ± RMSECV, flagging extrapolations. Useful when the analyte band overlaps other components.
- **Same deconvolution on all spectra**: after fitting one spectrum, *📑 Stessa deconvoluzione su tutti gli spettri* applies the same components to every spectrum of that instrument and shows a table of the component areas.
- Every table can be saved as CSV.

## Mixtures (🔎 Riferimenti tab)

- The similarity to reference spectra is now the average of the shape score (squared correlation after removing a straight line) and the **first-derivative** score, which is more sensitive to band positions and insensitive to the background.
- **🧩 È una miscela?** reconstructs the spectrum as a non-negative combination of the best references plus a free linear background (Lawson–Hanson NNLS) and reports each reference's share of the spectral area and the R² of the reconstruction.

## Analysis results in the download

The *🔬 Risultati delle analisi* option (step 3) also adds **analysis pages to the PDF** (per-spectrum warnings and hypotheses, calibration lines and PLS models with their plots, PCA score plots and dendrograms) and an `analisi/` folder to the ZIP with the quality check, qualitative hypotheses, deconvolution results, technique-specific parameters, band measurements and calibrations, PCA scores and groups, and **`metodi_e_bibliografia.txt`**: a draft *Methods* paragraph, in Italian or English, describing exactly the processing and analyses that were used, with the full references. Like the other outputs, it carries no tool name.

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

Median position error is under 1 % of the peak width. Limits: shoulders with no local maximum, and peaks merged with a neighbour, cannot be told apart by this method. You can add them by clicking on the plot, or separate them with the deconvolution (see below).

## Validation of the analysis tools

`node test/analysis-benchmark.js` (200 synthetic cases per test by default, `N=…` to change) checks every new algorithm against a known truth:

| Test | Result |
|---|---|
| Peak area, Lorentzian peaks | valley-to-valley −17.4 % → **fit −0.3 %** (90 % within ±4.8 %) |
| Peak area, pseudo-Voigt peaks | −11.5 % → **−0.2 %** (±3.2 %) |
| Peak area, pseudo-Voigt on a curved baseline (quadratic base) | −6.6 % → **+0.1 %** (±2.6 %) |
| Automatic deconvolution of two bands 0.7–1.5 FWHM apart | right number of components in **197/200**; area error median +0.02 % (±1.2 %) |
| Baseline under strong fluorescence (RMS error, % of tallest peak) | arPLS **1.4 %** vs rubber band 79 % |
| XRF net areas with SNIP background (Poisson counts) | median **+0.4 %** (±4.2 %) |
| Cosmic rays | **97 %** removed; true peak areas changed by at most 2.3 % |
| Calibration: 95 % CI of slope / of predicted concentration | contain the true value in **94.9 % / 95.2 %** of cases |
| Mandel test | false alarms 0.7 % (expected ~1 %); 4 % curvature detected in 100 % |
| PCA (SNV) + Ward on 3 groups with scattering | 50/50 perfect groupings; suggested number of groups right 50/50 |
| Mixtures (NNLS) | fractions within 0.02 points (median); 0 false components in 1200 |
| HPLC plate number / tailing / resolution | +0.1 % / 1.00 ± 0.02 / +0.6 % |
| Tauc band gap with an Urbach tail | −23 meV median (90 % within ±41 meV) |
| DSC extrapolated onset | 0.02 °C median error |
| EPR double integral ratios | −0.2 % median (±5.6 %) |
| PLS with an overlapping interferent (prediction error) | 0.001 vs 0.11 for a single-band line; Q² 1.00 |
| Raman pigment finder on spectra simulated from the database (consistency check) | right pigment first in 143/144, in the first three 144/144 |
| Protein secondary structure from a synthetic amide I with known fractions | median error 0.2 percentage points (90 % within 5.8) |
| XRF composition of simulated copper alloys (12 standards, matrix effects, Poisson noise) | Lucas-Tooth & Price + 100 %: Cu 0.47, Zn 0.18, Sn 0.15, Pb 0.12 wt % (median); linear Cu 3.7 |

`node test/format-test.js` checks the JCAMP-DX, `.spa` and OPUS readers.

`test/ui-collaudo.js` is an automatic test of the whole interface, to run in the browser (instructions at the top of the file): it loads synthetic spectra of every instrument plus malformed files (empty, text only, two points, constant, NaN/inf, negative values in log scale, decreasing and duplicated X, comma decimals, uncalibrated XRF), and exercises every tab, processing combination, deconvolution, right-click menu item, recipe, reference and mixture tool, multi-sample analysis, comparison, export (PDF, ZIP with PNG/SVG/CSV, Origin workbook, analysis results, in both languages), renaming, presets, modes and false colour. Last run: 1604 operations, no errors, also with the institute's HPLC, FTIR, Raman and XRF files.

The benchmarks run with Node.js; on a Mac without Node, Safari's JavaScriptCore (`jsc`) works too with a few lines of adapter for `require`.

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
2. Upload `index.html`, `README.md`, `apple-touch-icon.png` and the `test/` folder (`peak-benchmark.js`, `area-benchmark.js`, `analysis-benchmark.js`, `format-test.js`, `ui-collaudo.js`).
3. Open *Settings → Pages*, set *Source: Deploy from a branch*, then choose branch `main` and folder `/ (root)`, and click *Save*.
4. After about a minute the tool is online at `https://lorebiri.github.io/acchiappaspettri/`.

The PDF and ZIP libraries (jsPDF 2.5.1 and JSZip 3.10.1) load from cdnjs. If the institute network blocks them:

1. Download the two files into a `lib/` folder in the repository.
2. Change the two `<script src=…>` lines in `index.html` to point to those files.
