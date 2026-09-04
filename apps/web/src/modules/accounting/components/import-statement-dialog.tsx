'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { importBankStatementAction } from '../actions';

export function ImportStatementDialog({ bankAccounts }: { bankAccounts: Array<{ id: string; code: string; bankName: string }> }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? '');
  const [source, setSource] = useState<'mt940' | 'csv'>('csv');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (file.name.toLowerCase().endsWith('.sta') || file.name.toLowerCase().endsWith('.txt')) setSource('mt940');
    else setSource('csv');
    const reader = new FileReader();
    reader.onload = () => setFileText(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
  }

  async function submit() {
    if (!bankAccountId) { toast.error('Banka hesabı seçin'); return; }
    if (!fileText) { toast.error('Dosya seçin'); return; }
    setPending(true);
    const res = await importBankStatementAction({ bankAccountId, source, fileText });
    setPending(false);
    if (res.ok) {
      toast.success(`Ekstre içe aktarıldı: ${res.data.importedCount} yeni, ${res.data.duplicateCount} mükerrer`);
      setOpen(false);
      setFileName(null);
      setFileText(null);
      if (inputRef.current) inputRef.current.value = '';
      startTransition(() => router.refresh());
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="size-4" /> Ekstre içe aktar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Banka ekstresi içe aktar</DialogTitle>
          <DialogDescription>MT940 (.sta/.txt) veya CSV (Tarih;Açıklama;Tutar;Bakiye) — aynı hareket (externalRef) ikinci kez eklenmez.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Banka hesabı</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Hesap seçin…" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} — {a.bankName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Kaynak</Label>
            <Select value={source} onValueChange={(v) => setSource(v as 'mt940' | 'csv')}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="mt940">MT940 (.sta)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="statement-file">Dosya</Label>
            <input id="statement-file" ref={inputRef} type="file" accept=".csv,.sta,.txt" onChange={onPickFile} className="block w-full text-[13px] file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-[13px] file:font-medium" />
            {fileName ? <p className="text-[12px] text-muted-foreground">{fileName}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Vazgeç</Button>
          <Button onClick={submit} disabled={pending || !fileText}>{pending ? <Loader2 className="size-4 animate-spin" /> : null} İçe aktar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
