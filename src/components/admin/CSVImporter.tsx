import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as XLSX from 'xlsx';

// --- Interfaces ---
interface Chapter {
  id: string;
  name: string;
  chapter_number: number;
}

interface Subject {
  id: string;
  name: string;
  chapters: Chapter[];
}

interface ImportResult {
  success: number;
  errors: string[];
  total: number;
  sheetResults: { [sheetName: string]: { success: number; total: number; errors: string[] } };
}

export const CSVImporter = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const { toast } = useToast();

  // --- Fetch Dynamic Data ---
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('subjects')
          .select(`
            id,
            name,
            chapters (
              id,
              name,
              chapter_number
            )
          `)
          .order('name', { ascending: true });

        if (error) throw error;
        setSubjects(data || []);
      } catch (error: any) {
        toast({
          title: "Error fetching subjects",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setIsLoadingSubjects(false);
      }
    };
    loadData();
  }, []);

  // --- File Handling ---
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.xlsx') || file.name.endsWith('.csv'))) {
      setSelectedFile(file);
      setImportResult(null);
      parseFileForPreview(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a CSV or Excel (.xlsx) file",
        variant: "destructive",
      });
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else current += char;
    }
    result.push(current.trim());
    return result;
  };

  const parseFileForPreview = async (file: File) => {
    try {
      const sheets = await rawParse(file);
      const preview = Object.keys(sheets).slice(0, 5).map(sheetName => {
        const questions = processRowsToQuestions(sheets[sheetName]);
        return { sheet: sheetName, questionCount: questions.length };
      });
      setPreviewData(preview);
    } catch (error) {
      console.error('Preview error:', error);
    }
  };

  const rawParse = async (file: File): Promise<{ [key: string]: any[][] }> => {
    let sheets: { [key: string]: any[][] } = {};
    if (file.name.endsWith('.xlsx')) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      workbook.SheetNames.forEach(name => {
        sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
      });
    } else {
      const csvText = await file.text();
      const lines = csvText.split('\n').filter(l => l.trim());
      // Simplified CSV parsing: assume first line is Topic Name if not standard header
      sheets["Default CSV Topic"] = lines.map(parseCSVLine);
    }
    return sheets;
  };

  const processRowsToQuestions = (rows: any[][]) => {
    const questions = [];
    // Start from index 2 (Row 3) as per instructions
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (row[1] && row[2] && row[3]) { // Basic validation: Question + 2 options
        questions.push({
          question: String(row[1]).trim(),
          options: [String(row[2]), String(row[3]), String(row[4] || ''), String(row[5] || '')],
          answer: String(row[6]).trim().toUpperCase(),
          explanation: String(row[7] || '').trim()
        });
      }
    }
    return questions;
  };

  // --- Main Import Logic ---
  const importQuestions = async () => {
    if (!selectedFile || !selectedSubjectId) {
      toast({ title: "Missing Information", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    const result: ImportResult = { success: 0, errors: [], total: 0, sheetResults: {} };

    const subject = subjects.find(s => s.id === selectedSubjectId);
    if (!subject) return;

    try {
      const rawSheets = await rawParse(selectedFile);

      for (const [sheetName, rows] of Object.entries(rawSheets)) {
        const questions = processRowsToQuestions(rows);
        if (questions.length === 0) continue;

        const sheetResult = { success: 0, total: questions.length, errors: [] as string[] };
        result.total += questions.length;

        // Find matching chapter from our dynamic list
        const chapter = subject.chapters.find(c => c.name.toLowerCase() === sheetName.toLowerCase());

        if (!chapter) {
          const err = `Topic "${sheetName}" not found in database for ${subject.name}`;
          result.errors.push(err);
          sheetResult.errors.push(err);
          result.sheetResults[sheetName] = sheetResult;
          continue;
        }

        // Batch insert for better performance
        const inserts = questions.map(q => ({
          chapter_id: chapter.id,
          question: q.question,
          options: q.options,
          correct_answer: q.answer,
          explanation: q.explanation,
          subject: subject.name,
          difficulty: 'medium'
        }));

        const { error } = await supabase.from('mcqs').insert(inserts);

        if (error) {
          result.errors.push(`Error in ${sheetName}: ${error.message}`);
          sheetResult.errors.push(error.message);
        } else {
          result.success += questions.length;
          sheetResult.success = questions.length;
        }
        result.sheetResults[sheetName] = sheetResult;
      }

      setImportResult(result);
      toast({ title: "Import Complete", description: `Imported ${result.success} questions.` });
    } catch (error: any) {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="w-6 h-6" />
            <span>Dynamic Question Importer</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>1. Select Subject</Label>
              <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                <SelectTrigger>
                  {isLoadingSubjects ? <Loader2 className="animate-spin w-4 h-4" /> : <SelectValue placeholder="Select Subject" />}
                </SelectTrigger>
                <SelectContent>
                  {subjects.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">2. Select File (.xlsx or .csv)</Label>
              <Input id="file" type="file" accept=".csv,.xlsx" onChange={handleFileSelect} />
            </div>
          </div>

          {previewData.length > 0 && (
            <div className="border rounded-md p-4 bg-slate-50">
              <h4 className="font-medium mb-2">File Detection:</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sheet/Topic Name</TableHead>
                    <TableHead>Expected Questions</TableHead>
                    <TableHead>Database Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((sheet, i) => {
                    const match = subjects.find(s => s.id === selectedSubjectId)?.chapters.find(c => c.name.toLowerCase() === sheet.sheet.toLowerCase());
                    return (
                      <TableRow key={i}>
                        <TableCell>{sheet.sheet}</TableCell>
                        <TableCell>{sheet.questionCount}</TableCell>
                        <TableCell>{match ? <CheckCircle className="text-green-500 w-4 h-4" /> : <AlertCircle className="text-amber-500 w-4 h-4" />}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <Button onClick={importQuestions} disabled={!selectedFile || !selectedSubjectId || isImporting} className="w-full">
            {isImporting ? <Loader2 className="animate-spin mr-2" /> : <Upload className="mr-2 w-4 h-4" />}
            {isImporting ? "Processing..." : "Start Import"}
          </Button>

          {importResult && (
            <div className={`p-4 rounded-lg border ${importResult.errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className="font-bold">Result: {importResult.success} / {importResult.total} Success</p>
              {importResult.errors.map((err, i) => <p key={i} className="text-xs text-red-600">• {err}</p>)}
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};