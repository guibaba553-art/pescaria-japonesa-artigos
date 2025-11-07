import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ExcelRow {
  [key: string]: any;
}

interface ExcelImporterProps {
  onDataImported: (data: ExcelRow[]) => void;
  expectedColumns?: string[];
}

export function ExcelImporter({ onDataImported, expectedColumns }: ExcelImporterProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ExcelRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      // Pegar primeira planilha
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Converter para JSON
      const jsonData: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);
      
      if (jsonData.length === 0) {
        throw new Error("Planilha vazia");
      }

      const cols = Object.keys(jsonData[0]);
      setColumns(cols);
      setPreview(jsonData.slice(0, 5)); // Mostrar apenas primeiras 5 linhas

      // Validar colunas esperadas
      if (expectedColumns && expectedColumns.length > 0) {
        const missingColumns = expectedColumns.filter(col => !cols.includes(col));
        if (missingColumns.length > 0) {
          toast({
            title: "Atenção",
            description: `Colunas faltando: ${missingColumns.join(", ")}`,
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Excel carregado!",
        description: `${jsonData.length} linhas encontradas`,
      });

      onDataImported(jsonData);
    } catch (error: any) {
      console.error("Erro ao ler Excel:", error);
      toast({
        title: "Erro ao ler arquivo",
        description: error.message || "Formato inválido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Importar Excel
        </CardTitle>
        <CardDescription>
          Carregue uma planilha Excel (.xlsx, .xls, .csv) para importar dados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="excel-file">Arquivo Excel</Label>
          <div className="flex items-center gap-2">
            <Input
              id="excel-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              disabled={loading}
            />
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
          {expectedColumns && expectedColumns.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Colunas esperadas: {expectedColumns.join(", ")}
            </p>
          )}
        </div>

        {preview.length > 0 && (
          <div className="space-y-2">
            <Label>Prévia dos Dados (primeiras 5 linhas)</Label>
            <div className="border rounded-lg overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, idx) => (
                    <TableRow key={idx}>
                      {columns.map((col) => (
                        <TableCell key={col} className="whitespace-nowrap">
                          {String(row[col] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
