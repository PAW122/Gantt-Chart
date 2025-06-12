
document.addEventListener('DOMContentLoaded', () => {
    // file upload ===================================
    const uploadFile = document.getElementById('uploadFile');
    const uploadButton = document.getElementById('uploadButton');

    uploadButton.addEventListener('click', async function () {

        console.log('Upload button clicked');

        const file = uploadFile.files[0];
        if (!file) {
            alert('Please select a file first!');
            return;
        }

        try {
            const { results: graphList, aas, p } = await processZipFile(file);


            const chartsContainer = document.getElementById("chartsContainer");
            chartsContainer.innerHTML = ""; // wyczyść poprzednie wykresy

            graphList.forEach((graph, graphIndex) => {
                const parsedData = graph.data;

                // Kontener wykresu
                const container = document.createElement("div");
                container.className = "chart-container";
                container.style.marginBottom = "40px";
                container.style.height = "300px";
                container.style.border = "1px solid #ccc";
                container.style.borderRadius = "8px";
                container.style.padding = "10px";
                container.style.backgroundColor = "white";

                // Tytuł wykresu
                const title = document.createElement("h3");
                title.innerHTML = `${graph.name}<br><small>AAS: ${aas || '–'} | P: ${p || '–'}</small>`;
                title.style.textAlign = "center";
                title.style.marginBottom = "10px";
                title.style.fontFamily = "Roboto Condensed, sans-serif";

                // Canvas wykresu
                const canvas = document.createElement("canvas");
                canvas.id = `pimChart_${graphIndex}`;
                canvas.style.width = "100%";
                canvas.style.height = "100%";

                container.appendChild(title);
                container.appendChild(canvas);
                chartsContainer.appendChild(container);

                // Zakres Y
                let allValues = [];
                Object.values(parsedData.series).forEach(arr => {
                    allValues = allValues.concat(arr);
                });

                const min = Math.min(...allValues);
                const max = Math.max(...allValues);
                let range = max - min;
                let margin = range === 0 ? 0.1 : range * 0.1;
                const yMin = min - margin;
                const yMax = max + margin;

                // Wykres
                const ctx = canvas.getContext("2d");
                const datasets = Object.keys(parsedData.series)
                    .filter(key => key.toLowerCase() !== "average") // pomijamy średnią
                    .map((key, index) => ({
                        label: key,
                        data: parsedData.series[key],
                        fill: false,
                        borderColor: `hsl(${(index * 60) % 360}, 70%, 50%)`,
                        tension: 0.2
                    }));

                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: parsedData.labels,
                        datasets: datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false
                        },
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top'
                            },
                            tooltip: {
                                mode: 'index',
                                intersect: false,
                                callbacks: {
                                    label: function (context) {
                                        return `${context.dataset.label}: ${context.formattedValue} dB`;
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                min: yMin,
                                max: yMax,
                                title: {
                                    display: true,
                                    text: 'IPWR'
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Seconds'
                                }
                            }
                        }
                    }
                });

            });

        } catch (error) {
            console.error('Error processing file:', error);
            alert('Error processing ZIP file');
        }
    });


})

async function processZipFile(file) {
    if (!file.name.endsWith('.zip')) {
        throw new Error("Plik nie jest ZIP-em.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const results = [];

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && (filename.endsWith('.json') || filename.endsWith('.txt') && filename.includes("STEP") || filename.endsWith(".rtf"))) {
            try {
                if (filename.endsWith("rtf")) {
                    console.log("rtf-");
                    const rawContent = await zipEntry.async('text');
                    const lines = rawContent.split("\n");

                    let productNumber = null;
                    let serialNumber = null;

                    // Krok 1: znajdź Product Number i Serial Number
                    lines.forEach(line => {
                        if (line.includes("Product Number:")) {
                            const match = line.match(/Product Number:\s+([A-Z0-9 \/]+)/);
                            if (match) productNumber = match[1].trim();
                        }
                        if (line.includes("Serial Number:")) {
                            const match = line.match(/Serial Number:\s+([A-Z0-9]+)/);
                            if (match) serialNumber = match[1].trim();
                        }
                    });

                    if (!productNumber || !serialNumber) {
                        console.error("Nie znaleziono Product Number lub Serial Number");
                        return;
                    }

                    console.log("Product Number:", productNumber);
                    console.log("Serial Number:", serialNumber);

                    // Krok 2: znajdź wszystkie linie z wpisami [61]>
                    const entryLines = lines.filter(line => {
                        const afterArrow = line.split(">").pop();
                        const clean = afterArrow.replace(/\\[a-z]+\d*|{|}|\\par/g, "").trim();
                        const parts = clean.split(/\s{2,}|\t+/);
                        return parts.length >= 3;
                    });

                    // Krok 3: znajdź indeks głównej linii
                    const mainIndex = entryLines.findIndex(line =>
                        line.includes(productNumber) && line.includes(serialNumber)
                    );

                    if (mainIndex === -1) {
                        console.error("Nie znaleziono głównej linii z wpisem");
                        return;
                    }

                    const mainLine = entryLines[mainIndex];

                    // Krok 4: znajdź kolejne 2 linie po głównej, które mają strukturę: <unit> <rev> <serial>

                    const extractIndentLevel = (line) => {
                        const match = line.match(/>\s+/); // znajdź spacje po znaku >
                        return match ? match[0].length : 0;
                    };

                    const extractStructuredLinesWithIndent = (startIndex) => {
                        let aas = null;
                        let p = null;
                        let indentLevel = null;

                        for (let i = startIndex + 1; i < entryLines.length; i++) {
                            const raw = entryLines[i];
                            const clean = raw.split(">").pop().replace(/\\[a-z]+\d*|{|}|\\par/g, "").trim();
                            const parts = clean.split(/\s{2,}|\t+/);

                            if (parts.length >= 3) {
                                const unit = parts[2];
                                const currentIndent = extractIndentLevel(raw);

                                if (!aas) {
                                    aas = unit;
                                    indentLevel = currentIndent;
                                } else if (!p && currentIndent === indentLevel) {
                                    p = unit;
                                    break;
                                }
                            }
                        }

                        return [aas, p];
                    };


                    [aasGlobal, pGlobal] = extractStructuredLinesWithIndent(mainIndex);

                    console.log("== Wyniki ==");
                    console.log("Główna linia:", mainLine);
                    console.log("AAS:", aas || "Nie znaleziono");
                    console.log("P:", p || "Nie znaleziono");
                }


                // ==========================
                else {
                    const rawContent = await zipEntry.async('text');
                    const split_content = rawContent.split("\n")
                    // console.log(split_content)
                    results.push({
                        name: filename,
                        data: ParseData(split_content)
                    });
                }
            } catch (err) {
                console.warn(`❌ Błąd przy przetwarzaniu pliku ${filename}:`, err);
            }
        }
    }

    if (results.length === 0) {
        throw new Error("Nie znaleziono poprawnych plików JSON w ZIP.");
    }

    return { results, aas: aasGlobal, p: pGlobal };

}

function ParseData(lines) {
    const series = {
        CH0: [],
        CH1: [],
        CH2: [],
        CH3: []
    };

    lines.forEach(line => {
        // przykład: "FBG_0_0:0 :  48.107 dB\r"
        const match = line.match(/FBG_(\d)_(\d):\d\s*:\s*([\d.]+)\s*dB/);
        if (!match) return;

        const binX = parseInt(match[1]); // np. 0
        const binY = parseInt(match[2]); // np. 0
        const channelId = binX * 2 + binY; // 0..3
        const value = parseFloat(match[3]);

        const channelName = `CH${channelId}`;
        if (series[channelName]) {
            series[channelName].push(value);
        }
    });

    // liczba pomiarów jest taka sama dla wszystkich kanałów
    const labels = Array.from({ length: series.CH0.length }, (_, i) => i);

    return {
        labels,
        series
    };
}