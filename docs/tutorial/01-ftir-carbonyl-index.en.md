# Tutorial 1 · Carbonyl index from an FTIR series

**Goal:** from six FTIR spectra of aged polyethylene (0 to 1000 hours), get the carbonyl index, the plot of its trend over time, a PDF and a CSV file for Excel.
**Time:** about 10 minutes.
**You need:** Acchiappaspettri online (in the browser) or the desktop app. The steps are the same; where they differ, it is written.

> **SYNTHETIC example data.** The files in `examples/ftir-polietilene-sintetico/` were computed by `examples/genera-esempi-sintetici.js`. They are not real measurements. The file names (`…_SINTETICO.csv`, Italian for "synthetic") and the first line of each file say so too.

## What the carbonyl index measures
When polyethylene ages, it oxidises. A band appears between 1650 and 1850 cm⁻¹ (C=O groups). The «SAUB» carbonyl index (Almond and co-workers, 2020) is the area of this band divided by the area of the polyethylene band between 1420 and 1500 cm⁻¹. The higher it is, the more oxidised the material. The method is defined for polyethylene and polypropylene.

## 1. Load the spectra
1. Open Acchiappaspettri. In the online version, the first time, a welcome window appears: press **Let's start 👻** and then **▶ Use Acchiappaspettri Online**.
   *Desktop app:* there is no welcome window. The app opens on the **Start** tab, with the box for loading files.
2. Press **Choose files** and select the six files `PE_0000h_SINTETICO.csv` … `PE_1000h_SINTETICO.csv`. You can also drag them onto the page.
   *Desktop app:* press **Add spectra** in the top bar.
3. The program recognises the instrument by itself: **FTIR** appears next to each name.

## 2. Ask for the carbonyl index
1. To the right of the plot, open the **🔬 Analysis** tab.
2. In the box «What do you want to do with this FTIR / ATR-FTIR spectrum?» press **📉 How degraded is it?**.
   *Desktop app:* the tab is called **Analysis** and **How degraded is it?** is a link.

![The Analysis tab with the «How degraded is it?» button](img/t1-en-1-analisi.png)

The program sets the two regions of the index by itself (1650–1850 and 1420–1500 cm⁻¹) and measures all six spectra. A table appears with one row per spectrum and the column **area ratio**: this is the carbonyl index.
In the online version the table appears in the **🔬 Analysis** tab. *Desktop app:* the **Several samples** tab opens by itself.

With the menus in English, plots and numbers are in English too (decimal point: 0.84). The plot language can be changed in **Plot language**, on the download page (step 5).

## 3. Enter the ageing hours
The program does not know how many hours each file corresponds to: you enter them.

![The index table with the «Value of x» column (online version)](img/t1-en-2-misura.png)

1. In the column **Value of x** enter the hours, in the order of the files: `0`, `100`, `250`, `500`, `750`, `1000`. Press **Enter** after each number to move to the next row.
   Until the hours are entered, a yellow warning below the table says that the spectra are not in the plot: this is normal, and it goes away when you enter the values. Part of this warning is still in Italian.
2. In the box **Unit of x** (above the table) enter `h`.
3. The trend plot appears below the table, with the slope.

![Hours entered and trend plot (desktop app)](img/t1-en-3-andamento-desktop.png)

The vertical axis of this small plot is still labelled in Italian («rapporto area» = area ratio).

## 4. Read the result
With the example files you should get these values (tested several times, online and desktop, with identical results):

| File | Hours | Carbonyl index |
|---|---|---|
| PE_0000h | 0 | −0.0029 ⚠️ negative or zero area |
| PE_0100h | 100 | 0.0199 |
| PE_0250h | 250 | 0.105 |
| PE_0500h | 500 | 0.289 |
| PE_0750h | 750 | 0.551 |
| PE_1000h | 1000 | 0.842 |

Slope: 8.52e-4 ± 6.9e-5 per h, R² 0.975.

The slope is «per h» because you entered `h` in **Unit of x**: the same unit appears on screen, in the PDF and in the «Trend» row of the CSV. If you leave the box empty, the program writes «per unit of x».

How to read them:
- **The ⚠️ warning at 0 hours is normal.** The sample is not oxidised yet: there is no band and the area is about zero (here slightly below zero, because of the noise). The program says so instead of giving a confident number.
- **At 100 hours the band is just above the noise.** The program gives no warning, but the value is small and uncertain: do not give it too much weight.
- **The slope is descriptive only.** The program writes it: «the trend may not be linear». Here oxidation speeds up after the first few hundred hours, so the straight line does not describe the points well. Do not use it as a degradation model.

## 5. Download the PDF and the CSV for Excel
1. Press **All good, go and download** (bottom right). *Desktop app:* press **Export** in the top bar.
2. Check that **Plot language** is **🇬🇧 English**.
3. The options already ticked are fine. Press **⬇️ Download everything in one ZIP file**.

![The «What do you want to download?» page](img/t1-en-4-scarica.png)

In the ZIP file you find:
- `Spectra_report_….pdf`: the plots and, on the last page, «Trend · FTIR / ATR-FTIR» with the plot and the values;
- `analysis/band_measurements_ftir.csv`: the index table with the hours, to open in Excel (comma separator, decimal point). The last column, **Status**, holds the warnings;
- `analysis/methods_and_references.txt`: a draft «Methods» paragraph citing the SAUB method;
- the PNG images of each spectrum and the peak list.

![Last page of the PDF: carbonyl index trend](img/t1-en-5-pdf.png)

**Faster, CSV only:** the **⬇️ CSV** button next to the index table immediately downloads `band_measurements_ftir.csv` with the same numbers. Its name and column names follow the plot language (in Italian: `misure_ftir.csv`).

**The warnings stay in the files too.** A ⚠️ warning of the table (for example «negative or zero area») appears in the **Status** column of both CSV files and, in square brackets, next to the value on the last page of the PDF. Check the warnings before using the numbers.

## If something goes wrong
- **You do not see the «Value of x» column:** in the online version, if below the tab there is the box «Calibrations, PCA, mixtures, XRF composition and false colours are for in-depth study work», press **Show here**. Usually this is not needed: **How degraded is it?** shows the column by itself.
- **The «How degraded is it?» button is missing:** it appears only for spectra recognised as FTIR.
- **Numbers have decimal commas:** on the download page, under **Plot language**, choose **🇬🇧 English**.
- **Your spectra are in percent transmittance (values from 0 to 100):** you do not need to do anything. The program recognises it and computes the index in absorbance by itself: the numbers are the same as in the table above.
- **Your spectra are in transmittance from 0 to 1 (fraction):** this is the trap. If the file does not say it is transmittance, values from 0 to 1 look like absorbance, the bands are read upside down and the index would be wrong (with these examples 1.01 instead of 0.842). This is why the program gives no value and writes ⚠️ «transmittance read as absorbance». Remedy: for **each** spectrum, open the **🏷️ Spectrum data** tab (*desktop app:* **Data**) and under **Y axis** choose **transmittance %**. The choice applies to one spectrum only: repeat it for all six. Then the index is right again. The original files do not change.
