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

                    // Krok 2: znajdź wszystkie linie z wpisami [<int>]>
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
                } else {
                    const rawContent = await zipEntry.async('text');
                    const split_content = rawContent.split("\n")
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