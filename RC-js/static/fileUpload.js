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
            const graphList = await processZipFile(file);

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
                title.textContent = graph.name;
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
                                    text: 'dB'
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
        if (!zipEntry.dir && (filename.endsWith('.json') || filename.endsWith('.txt') && filename.includes("STEP"))) {
            try {
                const rawContent = await zipEntry.async('text');
                const split_content = rawContent.split("\n")
                // console.log(split_content)
                results.push({
                    name: filename,
                    data: ParseData(split_content)
                });

            } catch (err) {
                console.warn(`❌ Błąd przy przetwarzaniu pliku ${filename}:`, err);
            }
        }
    }

    if (results.length === 0) {
        throw new Error("Nie znaleziono poprawnych plików JSON w ZIP.");
    }

    return results;
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
