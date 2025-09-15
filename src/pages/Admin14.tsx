import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Quote-aware CSV parser (no external libraries)
 * - Handles commas inside quotes
 * - Handles escaped quotes ("")
 * - Normalizes CRLF/CR newlines
 * - Strips UTF-8 BOM
 */
const parseCSV = (csvString) => {
    if (!csvString) return { headers: [], rows: [] };

    const text = csvString
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/^\uFEFF/, "");

    const lines = text.split("\n");
    // drop leading/trailing empty lines
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (!lines.length) return { headers: [], rows: [] };

    const parseLine = (line) => {
        const out = [];
        let cur = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                else { inQuotes = !inQuotes; }
            } else if (ch === "," && !inQuotes) {
                out.push(cur);
                cur = "";
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out.map((s) => s.trim());
    };

    const headers = parseLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i]);
        if (values.length < headers.length) {
            while (values.length < headers.length) values.push("");
        } else if (values.length > headers.length) {
            // Merge overflow into last column
            const fixed = values.slice(0, headers.length - 1);
            fixed.push(values.slice(headers.length - 1).join(","));
            values.splice(0, values.length, ...fixed);
        }
        const row = {};
        headers.forEach((h, idx) => (row[h] = values[idx] ?? ""));
        rows.push({ __line: i + 1, ...row }); // keep actual line number from file (1-based)
    }

    return { headers, rows };
};

// If your DB column `important_ph` is TEXT, keep as string/null.
// If it's BOOLEAN, switch to coerceBoolean.
const coerceImportantPh = (v) => {
    const val = (v ?? "").toString().trim();
    return val === "" ? null : val; // TEXT behavior
    // BOOLEAN behavior:
    // const s = val.toLowerCase();
    // if (["true", "1", "yes", "y"].includes(s)) return true;
    // if (["false", "0", "no", "n"].includes(s)) return false;
    // return null;
};

const requiredHeaders = ["sentence"]; // minimal requirement
const optionalHeaders = ["important_ph", "topic"]; // supported optional columns

const validateRow = (row) => {
    const problems = [];
    if (!row.sentence || row.sentence.trim() === "") {
        problems.push("Missing required: sentence");
    }
    // You can add more schema checks here if needed.
    return { valid: problems.length === 0, problems };
};

const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

const truncate = (s, n = 100) => {
    if (!s) return "";
    return s.length > n ? s.slice(0, n) + "…" : s;
};

const Admin14 = () => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [chapters, setChapters] = useState([]);
    const [selectedChapterId, setSelectedChapterId] = useState("");

    const [parsed, setParsed] = useState({ headers: [], rows: [] });
    const [preview, setPreview] = useState([]); // [{line, sentence, topic, important_ph, status, reason}]
    const [results, setResults] = useState([]); // per-row upload result

    const readyRows = useMemo(() => preview.filter((r) => r.status === "ready"), [preview]);
    const invalidRows = useMemo(() => preview.filter((r) => r.status === "invalid"), [preview]);
    const uploadedOk = useMemo(() => results.filter((r) => r.status === "inserted"), [results]);
    const uploadedFail = useMemo(() => results.filter((r) => r.status === "failed"), [results]);

    // Fetch chapters
    useEffect(() => {
        const fetchChapters = async () => {
            setMessage("Fetching chapters...");
            const { data, error } = await supabase
                .from("chapters")
                .select("id, name")
                .order("name", { ascending: true });
            if (error) {
                console.error("Error fetching chapters:", error);
                setMessage(`Error fetching chapters: ${error.message}`);
                return;
            }
            setChapters(data || []);
            if (data && data.length > 0) setSelectedChapterId(data[0].id);
            setMessage("");
        };
        fetchChapters();
    }, []);

    const handleFileChange = (event) => {
        setFile(event.target.files[0] || null);
        setParsed({ headers: [], rows: [] });
        setPreview([]);
        setResults([]);
        setMessage("");
    };

    const buildPreview = (rows) => {
        const list = rows.map((r) => {
            // Normalize fields we care about (case-insensitive header support)
            // Create a lowercased key map for safety
            const lower = Object.keys(r).reduce((acc, k) => {
                acc[k.toLowerCase()] = r[k];
                return acc;
            }, {});

            const sentence = (lower["sentence"] ?? "").toString();
            const topic = (lower["topic"] ?? "").toString();
            const important_raw = lower["important_ph"] ?? "";

            const { valid, problems } = validateRow({ sentence, topic, important_ph: important_raw });
            return {
                line: r.__line ?? null,
                sentence,
                topic,
                important_ph: important_raw,
                status: valid ? "ready" : "invalid",
                reason: valid ? "—" : problems.join("; "),
            };
        });
        setPreview(list);
    };

    const handleParse = async () => {
        if (!file) {
            setMessage("Please select a CSV file to parse.");
            return;
        }
        setLoading(true);
        setMessage("Parsing CSV...");

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csvContent = e.target?.result || "";
                const { headers, rows } = parseCSV(csvContent);
                setParsed({ headers, rows });

                // Header sanity check
                const lowerHeaders = headers.map((h) => h.toLowerCase());
                const missingRequired = requiredHeaders.filter((h) => !lowerHeaders.includes(h));
                if (missingRequired.length) {
                    setMessage(`CSV missing required header(s): ${missingRequired.join(", ")}`);
                } else {
                    setMessage("");
                }
                buildPreview(rows);
            } catch (err) {
                console.error("Parse error", err);
                setMessage("Error parsing CSV file.");
            } finally {
                setLoading(false);
            }
        };
        reader.onerror = () => {
            setMessage("Error reading file.");
            setLoading(false);
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!selectedChapterId) {
            setMessage("Please select a chapter before importing.");
            return;
        }
        if (!readyRows.length) {
            setMessage("No valid rows to import. Fix invalid rows first.");
            return;
        }

        setLoading(true);
        setResults([]);
        setMessage(`Starting import of ${readyRows.length} rows...`);

        let ok = 0;
        let fail = 0;

        // For precise per-row error reporting, insert sequentially.
        // (You can switch to small batches + Promise.allSettled if needed.)
        for (let i = 0; i < readyRows.length; i++) {
            const r = readyRows[i];
            const payload = {
                sentence: r.sentence?.trim() || "",
                important_ph: coerceImportantPh(r.important_ph),
                topic: r.topic?.trim() || null,
                chapter_id: selectedChapterId,
            };

            try {
                const { error } = await supabase.from("flashcards").insert(payload);
                if (error) {
                    fail++;
                    setResults((prev) => [
                        ...prev,
                        { line: r.line, status: "failed", error: error.message }
                    ]);
                } else {
                    ok++;
                    setResults((prev) => [
                        ...prev,
                        { line: r.line, status: "inserted" }
                    ]);
                }
            } catch (e) {
                fail++;
                setResults((prev) => [
                    ...prev,
                    { line: r.line, status: "failed", error: e?.message || "Unknown error" }
                ]);
            }

            // progress text
            setMessage(`Importing... ${i + 1}/${readyRows.length} done`);
        }

        setLoading(false);
        setMessage(`Import complete: ${ok} inserted, ${fail} failed. (${readyRows.length} attempted)`);
    };

    return (
        <div className="flex flex-col flex-1 p-4">
            <header className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Admin 14: CSV Importer</h1>
            </header>

            <main className="flex-1 overflow-y-auto">
                <div className="bg-white p-6 rounded-lg shadow-md max-w-6xl mx-auto">
                    {/* Chapter select */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="chapter-select" className="block text-gray-700 text-sm font-semibold mb-2">
                                Select Chapter
                            </label>
                            <select
                                id="chapter-select"
                                value={selectedChapterId}
                                onChange={(e) => setSelectedChapterId(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={loading || chapters.length === 0}
                            >
                                {chapters.length === 0 ? (
                                    <option value="">Loading chapters...</option>
                                ) : (
                                    chapters.map((chapter) => (
                                        <option key={chapter.id} value={chapter.id}>
                                            {chapter.name}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* File input */}
                        <div>
                            <label htmlFor="csv-file" className="block text-gray-700 text-sm font-semibold mb-2">
                                Upload CSV File
                            </label>
                            <input
                                type="file"
                                id="csv-file"
                                accept=".csv"
                                onChange={handleFileChange}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-end gap-2">
                            <button
                                onClick={handleParse}
                                disabled={loading || !file}
                                className={`px-4 py-3 rounded-md text-white font-semibold transition-colors duration-200 ${loading || !file ? "bg-blue-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                    }`}
                            >
                                Parse & Preview
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={loading || !selectedChapterId || !readyRows.length}
                                className={`px-4 py-3 rounded-md text-white font-semibold transition-colors duration-200 ${loading || !selectedChapterId || !readyRows.length
                                        ? "bg-emerald-300 cursor-not-allowed"
                                        : "bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                                    }`}
                            >
                                Upload Ready Rows
                            </button>
                        </div>
                    </div>

                    {/* Status message */}
                    {message && (
                        <div
                            className={`mt-4 p-3 rounded-md text-sm text-center ${message.toLowerCase().includes("error") ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-800"
                                }`}
                        >
                            {message}
                        </div>
                    )}

                    {/* Preview summary */}
                    {preview.length > 0 && (
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="p-4 bg-gray-50 rounded-lg border">
                                <div className="text-sm text-gray-500">Total Rows</div>
                                <div className="text-2xl font-semibold">{preview.length}</div>
                            </div>
                            <div className="p-4 bg-green-50 rounded-lg border">
                                <div className="text-sm text-gray-600">Ready</div>
                                <div className="text-2xl font-semibold text-green-700">{readyRows.length}</div>
                            </div>
                            <div className="p-4 bg-yellow-50 rounded-lg border">
                                <div className="text-sm text-gray-600">Invalid</div>
                                <div className="text-2xl font-semibold text-yellow-700">{invalidRows.length}</div>
                            </div>
                            <div className="p-4 bg-indigo-50 rounded-lg border">
                                <div className="text-sm text-gray-600">Uploaded (this run)</div>
                                <div className="text-lg font-semibold text-indigo-700">✅ {uploadedOk.length} / ❌ {uploadedFail.length}</div>
                            </div>
                        </div>
                    )}

                    {/* Preview table */}
                    {preview.length > 0 && (
                        <div className="mt-6 border rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-100 text-gray-700 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Line</th>
                                            <th className="px-3 py-2 text-left">Status</th>
                                            <th className="px-3 py-2 text-left">Sentence</th>
                                            <th className="px-3 py-2 text-left">Topic</th>
                                            <th className="px-3 py-2 text-left">important_ph</th>
                                            <th className="px-3 py-2 text-left">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.map((r, idx) => (
                                            <tr key={`${r.line}-${idx}`} className={r.status === "ready" ? "bg-white" : "bg-yellow-50"}>
                                                <td className="px-3 py-2 whitespace-nowrap">{r.line}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">
                                                    {r.status === "ready" ? (
                                                        <span className="inline-flex items-center gap-1 text-green-700">● Ready</span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-yellow-700">● Invalid</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 min-w-[400px]">{truncate(r.sentence, 200)}</td>
                                                <td className="px-3 py-2">{truncate(r.topic, 60)}</td>
                                                <td className="px-3 py-2">{truncate(String(r.important_ph ?? ""), 60)}</td>
                                                <td className="px-3 py-2 text-red-700">{r.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Upload results (errors) */}
                    {uploadedFail.length > 0 && (
                        <div className="mt-6">
                            <h3 className="font-semibold text-red-700 mb-2">Rows that failed to upload</h3>
                            <div className="border rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-red-50 text-red-700">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Line</th>
                                                <th className="px-3 py-2 text-left">Error</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {uploadedFail.map((r, idx) => (
                                                <tr key={`fail-${r.line}-${idx}`} className="bg-white">
                                                    <td className="px-3 py-2 whitespace-nowrap">{r.line}</td>
                                                    <td className="px-3 py-2">{r.error}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Help: expected CSV structure */}
                <div className="mt-8 text-gray-600 text-sm max-w-6xl mx-auto">
                    <h2 className="font-semibold text-lg mb-2">Expected CSV Structure</h2>
                    <p className="mb-1">Headers (case-insensitive):</p>
                    <ul className="list-disc list-inside bg-gray-50 p-3 rounded-md border border-gray-200">
                        <li><code className="font-mono text-blue-700">sentence</code> (required)</li>
                        <li><code className="font-mono text-blue-700">important_ph</code> (optional)</li>
                        <li><code className="font-mono text-blue-700">topic</code> (optional)</li>
                        <li className="text-red-600 font-semibold">No need for <code className="font-mono">chapter</code> or <code className="font-mono">subject</code> columns; the selected chapter is applied.</li>
                    </ul>
                    <p className="mt-2 text-xs text-gray-500">Tip: The parser handles quotes, commas inside quotes, CRLF, and BOM.</p>
                </div>
            </main>
        </div>
    );
};

export default Admin14;
