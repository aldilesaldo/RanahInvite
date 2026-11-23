import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Pencil,
  Plus,
  X,
} from 'lucide-react';
import { BankSyncUpdate, EventMetadata, NavTab, Recipient, RsvpStatus } from '../types';
import { PdfBankChecklistModal } from './PdfBankChecklistModal';
import { PaginationBar } from './PaginationBar';
import { CountUpNumber, HighlightedText } from './UiPolish';
import { BrandIcon, IconBadge } from './BrandIcon';
import { StepFooterNav } from './WorkflowStepperBar';
import {
  ColumnMapping,
  ParsedImportResult,
  downloadSampleXlsx,
  mapRowsToRecipients,
  parseImportFile,
} from '../utils/importer';
import { getRsvpLabel } from '../utils/rsvp';
import { triggerBlobDownload } from '../utils/pdfEngine';
import { generateInvitationListReportPdf } from '../utils/reportPdf';
import { exportInvitationListReportExcel } from '../utils/reportExcel';

interface GuestListViewProps {
  recipients: Recipient[];
  filteredRecipients: Recipient[];
  availableGroups: { name: string; count: number }[];
  groupFilter: string;
  onSelectGroupFilter: (group: string) => void;
  metadata: EventMetadata;
  onAddRecipient: (recipient: Omit<Recipient, 'id' | 'status'>) => void;
  onUpdateRecipient: (id: string, patch: Partial<Recipient>) => void;
  onDeleteRecipient: (id: string) => void;
  onBulkDeleteByGroup: (targetGroup: string) => void;
  onApplyPdfSelection: (selected: Recipient[], mode: 'append' | 'replace') => void;
  onSyncBankUpdates?: (updates: BankSyncUpdate[]) => number;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
  onBulkImport: (imported: Recipient[], mode: 'append' | 'replace') => void;
  onPreviewRecipient: (recipient: Recipient) => void;
  onDownloadSinglePdf: (recipient: Recipient) => void;
  onSimulateRsvp: (recipient: Recipient) => void;
  onNavigate: (tab: NavTab) => void;
  downloadingId: string | null;
  searchQuery?: string;
}

export const GuestListView: React.FC<GuestListViewProps> = ({
  recipients,
  filteredRecipients,
  availableGroups,
  groupFilter,
  onSelectGroupFilter,
  metadata,
  onAddRecipient,
  onUpdateRecipient,
  onDeleteRecipient,
  onBulkDeleteByGroup,
  onApplyPdfSelection,
  onSyncBankUpdates,
  onNotify,
  onBulkImport,
  onPreviewRecipient,
  onDownloadSinglePdf,
  onSimulateRsvp,
  onNavigate,
  downloadingId,
  searchQuery = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rsvpFilter, setRsvpFilter] = useState<'all' | RsvpStatus>('all');
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [confirmClearGroup, setConfirmClearGroup] = useState(false);
  const [isExportingReportPdf, setIsExportingReportPdf] = useState(false);
  const GUEST_PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [formValues, setFormValues] = useState({
    salutation: 'Kepada Yth.',
    recipientName: '',
    institution: '',
    placeLabel: '',
    group: '',
    invitationCode: '',
  });
  const [importData, setImportData] = useState<ParsedImportResult | null>(null);
  const [importMapping, setImportMapping] = useState<ColumnMapping>({
    salutation: '',
    recipientName: '',
    institution: '',
    placeLabel: '',
    group: '',
    invitationCode: '',
  });
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importError, setImportError] = useState<string | null>(null);

  const openAddForm = () => {
    setEditingId(null);
    const nextCode = `RI-${String(recipients.length + 1).padStart(3, '0')}`;
    setFormValues({
      salutation: 'Kepada Yth.',
      recipientName: '',
      institution: '',
      placeLabel: '',
      group: groupFilter !== 'Semua' ? groupFilter : '',
      invitationCode: nextCode,
    });
    setFormOpen(true);
  };

  const openEditForm = (r: Recipient) => {
    setEditingId(r.id);
    setFormValues({
      salutation: r.salutation,
      recipientName: r.recipientName,
      institution: r.institution,
      placeLabel: r.placeLabel ?? '',
      group: r.group ?? '',
      invitationCode: r.invitationCode,
    });
    setFormOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.recipientName.trim()) return;

    if (editingId) {
      onUpdateRecipient(editingId, {
        salutation: formValues.salutation.trim() || 'Kepada Yth.',
        recipientName: formValues.recipientName.trim(),
        institution: formValues.institution.trim() || '-',
        placeLabel: formValues.placeLabel.trim() || undefined,
        group: formValues.group.trim() || undefined,
        invitationCode: formValues.invitationCode.trim() || `RI-${Date.now().toString().slice(-4)}`,
        status: 'ready',
      });
    } else {
      onAddRecipient({
        salutation: formValues.salutation.trim() || 'Kepada Yth.',
        recipientName: formValues.recipientName.trim(),
        institution: formValues.institution.trim() || '-',
        placeLabel: formValues.placeLabel.trim() || undefined,
        group: formValues.group.trim() || undefined,
        invitationCode:
          formValues.invitationCode.trim() ||
          `RI-${String(recipients.length + 1).padStart(3, '0')}`,
      });
    }
    setFormOpen(false);
  };

  const handleFileChange = async (file?: File) => {
    if (!file) return;
    setImportError(null);
    try {
      const parsed = await parseImportFile(file);
      setImportData(parsed);
      setImportMapping(parsed.suggestedMapping);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Gagal membaca berkas.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!importData) return;
    const mapped = mapRowsToRecipients(
      importData.rows,
      importMapping,
      importMode === 'replace' ? 0 : recipients.length
    );
    if (mapped.length === 0) {
      setImportError('Tidak ada baris valid yang dapat diimpor dengan pemetaan kolom ini.');
      return;
    }
    onBulkImport(mapped, importMode);
    setImportData(null);
  };

  const rsvpCounts = useMemo(() => {
    let attending = 0;
    let represented = 0;
    let declined = 0;
    let pending = 0;
    for (const r of recipients) {
      if (r.rsvpStatus === 'attending') attending++;
      else if (r.rsvpStatus === 'represented') represented++;
      else if (r.rsvpStatus === 'declined') declined++;
      else pending++;
    }
    return { attending, represented, declined, pending };
  }, [recipients]);

  const displayedRecipients = useMemo(() => {
    if (rsvpFilter === 'all') return filteredRecipients;
    return filteredRecipients.filter(
      (r) => (r.rsvpStatus ?? 'pending') === rsvpFilter
    );
  }, [filteredRecipients, rsvpFilter]);

  const totalPages = Math.max(1, Math.ceil(displayedRecipients.length / GUEST_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecipients = useMemo(() => {
    const start = (safePage - 1) * GUEST_PAGE_SIZE;
    return displayedRecipients.slice(start, start + GUEST_PAGE_SIZE);
  }, [displayedRecipients, safePage]);

  const buildReportFilterSummary = () => {
    const scopeParts: string[] = [];
    if (groupFilter !== 'Semua') scopeParts.push(`Kelompok: ${groupFilter}`);
    if (rsvpFilter !== 'all') scopeParts.push(`RSVP: ${getRsvpLabel(rsvpFilter)}`);
    if (searchQuery.trim()) scopeParts.push(`Pencarian: "${searchQuery.trim()}"`);
    return scopeParts.length > 0 ? scopeParts.join(' | ') : 'Seluruh Daftar Penerima';
  };

  const handleExportReportPdf = async () => {
    const targetList = displayedRecipients;
    if (targetList.length === 0 || isExportingReportPdf) return;
    setIsExportingReportPdf(true);
    try {
      const { bytes, filename } = await generateInvitationListReportPdf({
        metadata,
        recipients: targetList,
        filterSummary: buildReportFilterSummary(),
      });
      triggerBlobDownload(bytes, filename, 'application/pdf');
      onNotify?.(
        `Laporan PDF (${targetList.length} penerima) berhasil diekspor: ${filename}`
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal mengekspor laporan PDF.',
        'error'
      );
    } finally {
      setIsExportingReportPdf(false);
    }
  };

  const handleExportReportExcel = () => {
    const targetList = displayedRecipients;
    if (targetList.length === 0) return;
    try {
      const { filename } = exportInvitationListReportExcel({
        metadata,
        recipients: targetList,
        filterSummary: buildReportFilterSummary(),
      });
      onNotify?.(
        `Laporan Excel (${targetList.length} penerima) berhasil diekspor: ${filename}`
      );
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Gagal mengekspor laporan Excel.',
        'error'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EDF6F9] pb-4">
        <div className="flex items-center gap-3">
          <IconBadge name="nav-guests" size="md" />
          <div>
            <div className="text-[11.5px] font-semibold text-[#1F9B96]">
              Tahap 2 dari 4
            </div>
            <h2 className="font-display font-bold text-[20px] text-[#1B1B4B] leading-tight">
              Daftar Penerima &amp; RSVP
            </h2>
            <p className="text-[13px] text-[#757E96] mt-0.5 tabular-nums">
              <CountUpNumber value={displayedRecipients.length} /> dari{' '}
              <CountUpNumber value={recipients.length} /> penerima
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F9DE6C] hover:bg-[#F3D34F] text-[13px] font-semibold text-[#1B1B4B] transition-colors shadow-xs whitespace-nowrap"
          >
            <BrandIcon name="action-upload" className="w-5 h-5 text-[#1B1B4B]" />
            <span>Impor Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-[13px] font-semibold text-white transition-colors shadow-xs whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Penerima</span>
          </button>
        </div>
      </div>

      {/* Highlighted Quick-Access Strip: PinHome Soft Sky Bank Daftar Card + Laporan & Berkas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Featured Signature Panel: Bank Daftar PDF (11 Grup) — Styled after PinHome pastel sky promo card */}
        <div className="lg:col-span-6 relative overflow-hidden rounded-[22px] border border-[#B2E3F0] bg-[#D6F1F8] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          {/* Subtle playful PinHome blush-pink decorative accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#F7B7C6]/50"
          />
          <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
            <IconBadge name="action-bank" size="md" />
            <div className="min-w-0">
              <div className="font-display font-bold text-[15px] text-[#1B1B4B] truncate">
                Bank Daftar PDF (11 Grup)
              </div>
              <div className="text-[12px] text-[#1B1B4B]/70 truncate">
                Direktori tujuan resmi siap centang &amp; simpan sebagai master
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setBankModalOpen(true)}
            className="relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F9DE6C] text-[#1B1B4B] text-[12px] font-bold hover:bg-[#F3D34F] transition-colors shadow-xs whitespace-nowrap shrink-0"
          >
            <BrandIcon name="action-bank" className="w-4 h-4 text-[#1B1B4B]" />
            <span>Buka Bank Daftar</span>
          </button>
        </div>

        {/* Compact Utility Panel: Ekspor Laporan PDF, Laporan Excel (.XLSX), & Template Excel */}
        <div className="lg:col-span-6 rounded-[22px] border border-[#DFEFF4] bg-[#F4FBFD] px-5 py-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-[12px] font-semibold text-[#1B1B4B] whitespace-nowrap">
            Laporan &amp; Berkas:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportReportPdf}
              disabled={displayedRecipients.length === 0 || isExportingReportPdf}
              title={
                displayedRecipients.length === 0
                  ? 'Input atau pilih penerima terlebih dahulu untuk membuat laporan PDF'
                  : `Ekspor ${displayedRecipients.length} penerima ke Laporan PDF resmi (A4)`
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#1F9B96] text-white text-[12px] font-semibold hover:bg-[#167F7B] disabled:opacity-45 disabled:cursor-not-allowed transition-colors shadow-xs whitespace-nowrap"
            >
              <BrandIcon name="doc-pdf" white className="w-4 h-4" />
              <span>{isExportingReportPdf ? 'Membuat PDF...' : 'Laporan PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportReportExcel}
              disabled={displayedRecipients.length === 0}
              title={
                displayedRecipients.length === 0
                  ? 'Input atau pilih penerima terlebih dahulu untuk membuat laporan Excel'
                  : `Ekspor ${displayedRecipients.length} penerima ke Laporan Excel (.xlsx) dengan lebar kolom otomatis`
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#F9DE6C] text-[#1B1B4B] text-[12px] font-semibold hover:bg-[#F3D34F] disabled:opacity-45 disabled:cursor-not-allowed transition-colors shadow-xs whitespace-nowrap"
            >
              <BrandIcon name="action-download-doc" className="w-4 h-4 text-[#1B1B4B]" />
              <span>Laporan XLS</span>
            </button>
            <button
              type="button"
              onClick={downloadSampleXlsx}
              title="Unduh template impor Excel (.XLSX)"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#DDEEF3] bg-white text-[12px] font-semibold text-[#1B1B4B] hover:border-[#1F9B96]/50 hover:bg-[#E3F5FA]/50 transition-colors whitespace-nowrap"
            >
              <BrandIcon name="action-download" className="w-4 h-4 text-[#1B1B4B]" />
              <span>Template .XLSX</span>
            </button>
          </div>
        </div>
      </div>

      {/* Unified Filter & Interactive RSVP Attendance Bar */}
      <div className="rounded-[22px] border border-[#E5F1F5] bg-white divide-y divide-[#EDF6F9] overflow-hidden">
        {/* Top Row: Group Filter + Group Cleanup */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
            <label
              htmlFor="guest-group-filter"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#1B1B4B] whitespace-nowrap"
            >
              <BrandIcon name="action-database" className="w-5 h-5 text-[#1B1B4B]" />
              <span>Kelompok:</span>
            </label>
            <select
              id="guest-group-filter"
              value={groupFilter}
              onChange={(e) => {
                onSelectGroupFilter(e.target.value);
                setCurrentPage(1);
                setConfirmClearGroup(false);
              }}
              className="flex-1 max-w-md rounded-full border border-[#DDEEF3] bg-[#F4FBFD] px-3.5 py-1.5 text-[13px] font-medium text-[#1B1B4B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
            >
              <option value="Semua">Semua Kelompok ({recipients.length})</option>
              {availableGroups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name} ({g.count})
                </option>
              ))}
            </select>
          </div>

          {recipients.length > 0 && (
            <div className="flex items-center gap-2">
              {confirmClearGroup ? (
                <div className="flex items-center gap-2 rounded-full bg-[#FDE8EE] border border-[#F5C6D2] px-3.5 py-1.5 text-[12px]">
                  <span className="text-[#B83B5E] font-medium">
                    {groupFilter === 'Semua'
                      ? `Kosongkan semua (${recipients.length})?`
                      : `Hapus "${groupFilter}"?`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onBulkDeleteByGroup(groupFilter);
                      setConfirmClearGroup(false);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-0.5 rounded-full bg-[#B83B5E] text-white font-semibold hover:brightness-95"
                  >
                    Ya, Hapus
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearGroup(false)}
                    className="px-2.5 py-0.5 rounded-full bg-white border border-[#E5F1F5] text-[#757E96] hover:bg-[#F4FBFD]"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearGroup(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#F5C6D2] bg-[#FFF5F7] text-[12px] font-semibold text-[#B83B5E] hover:bg-[#FDE8EE] transition-colors whitespace-nowrap"
                >
                  <BrandIcon name="action-trash" className="w-3.5 h-3.5" />
                  <span>
                    {groupFilter === 'Semua' ? 'Kosongkan Daftar' : 'Hapus Kelompok Ini'}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Row: Unified Interactive RSVP Summary + Filter Tabs (static counts, no animation) */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#F4FBFD]">
          <span className="text-[12px] font-semibold text-[#757E96] mr-1 whitespace-nowrap">
            Filter RSVP:
          </span>

          <button
            type="button"
            onClick={() => {
              setRsvpFilter('all');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold tabular-nums transition-colors whitespace-nowrap ${
              rsvpFilter === 'all'
                ? 'bg-[#1B1B4B] text-white shadow-xs'
                : 'bg-white border border-[#DDEEF3] text-[#1B1B4B] hover:bg-[#E3F5FA]/60'
            }`}
          >
            <span>Semua</span>
            <span className={rsvpFilter === 'all' ? 'text-white/80' : 'text-[#757E96]'}>
              ({recipients.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRsvpFilter('attending');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-semibold tabular-nums transition-colors whitespace-nowrap ${
              rsvpFilter === 'attending'
                ? 'bg-[#1F9B96] text-white shadow-xs'
                : 'bg-[#DCF5F1] border border-[#B5E9E0] text-[#157A76] hover:bg-[#CBEFE9]'
            }`}
          >
            <IconBadge
              name="rsvp-attending"
              size="xs"
              white={rsvpFilter === 'attending'}
            />
            <span>Hadir ({rsvpCounts.attending})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRsvpFilter('represented');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-semibold tabular-nums transition-colors whitespace-nowrap ${
              rsvpFilter === 'represented'
                ? 'bg-[#167F7B] text-white shadow-xs'
                : 'bg-[#E3F5FA] border border-[#B5E4F1] text-[#167F7B] hover:bg-[#D1EFF7]'
            }`}
          >
            <IconBadge
              name="rsvp-represented"
              size="xs"
              white={rsvpFilter === 'represented'}
            />
            <span>Diwakilkan ({rsvpCounts.represented})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRsvpFilter('declined');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-semibold tabular-nums transition-colors whitespace-nowrap ${
              rsvpFilter === 'declined'
                ? 'bg-[#B83B5E] text-white shadow-xs'
                : 'bg-[#FDE8EE] border border-[#F5C6D2] text-[#B83B5E] hover:bg-[#FAD6E0]'
            }`}
          >
            <IconBadge
              name="rsvp-declined"
              size="xs"
              white={rsvpFilter === 'declined'}
            />
            <span>Berhalangan ({rsvpCounts.declined})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRsvpFilter('pending');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-semibold tabular-nums transition-colors whitespace-nowrap ${
              rsvpFilter === 'pending'
                ? 'bg-[#757E96] text-white shadow-xs'
                : 'bg-white border border-[#DDEEF3] text-[#757E96] hover:bg-[#E3F5FA]/50'
            }`}
          >
            <IconBadge
              name="rsvp-pending"
              size="xs"
              white={rsvpFilter === 'pending'}
            />
            <span>Belum ({rsvpCounts.pending})</span>
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-2xl bg-[#FDE8EE] border border-[#F5C6D2] px-4 py-3 text-[13px] text-[#B83B5E] flex items-center justify-between">
          <span>{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="p-1 hover:bg-white/60 rounded-full"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Manual Add / Edit Form Panel */}
      {formOpen && (
        <motion.form
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmitForm}
          className="rounded-[22px] border border-[#B5E4F1] bg-[#E3F5FA]/65 p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[15px] text-[#1B1B4B]">
              {editingId ? 'Sunting Data Penerima' : 'Tambah Penerima Baru'}
            </h3>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-1.5 rounded-full text-[#757E96] hover:bg-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                Sapaan
              </label>
              <input
                type="text"
                value={formValues.salutation}
                onChange={(e) =>
                  setFormValues({ ...formValues, salutation: e.target.value })
                }
                placeholder="Kepada Yth."
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                Nama Penerima / Jabatan *
              </label>
              <input
                type="text"
                required
                value={formValues.recipientName}
                onChange={(e) =>
                  setFormValues({ ...formValues, recipientName: e.target.value })
                }
                placeholder="Contoh: Kepala Dinas Pariwisata Kab. Agam"
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                Instansi / Asal Daerah
              </label>
              <input
                type="text"
                value={formValues.institution}
                onChange={(e) =>
                  setFormValues({ ...formValues, institution: e.target.value })
                }
                placeholder="Contoh: Pemerintah Kabupaten Agam"
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                Keterangan Tempat (Opsional)
              </label>
              <input
                type="text"
                value={formValues.placeLabel}
                onChange={(e) =>
                  setFormValues({ ...formValues, placeLabel: e.target.value })
                }
                placeholder="Default: di tempat"
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                Kelompok / Grup (Opsional)
              </label>
              <input
                type="text"
                value={formValues.group}
                onChange={(e) =>
                  setFormValues({ ...formValues, group: e.target.value })
                }
                placeholder="Contoh: OPD Pemprov Sumbar"
                className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
              />
            </div>

            <div className="lg:col-span-1 flex items-end justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-medium text-[#757E96] hover:bg-[#F4FBFD]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-full text-[13px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B]"
              >
                {editingId ? 'Simpan' : 'Tambah'}
              </button>
            </div>
          </div>
        </motion.form>
      )}

      {/* Recipients Data Table */}
      <div className="rounded-[22px] border border-[#E5F1F5] bg-white overflow-hidden">
        {displayedRecipients.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="font-display font-bold text-[15px] text-[#1B1B4B]">
              Tidak ada penerima undangan yang sesuai
            </p>
            <p className="text-[13px] text-[#757E96] mt-1 mb-4">
              Tambahkan penerima secara manual, ubah filter RSVP, atau impor daftar tamu dari Excel (.XLSX) / CSV.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setBankModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#B2E3F0] bg-[#D6F1F8] text-[13px] font-semibold text-[#1B1B4B] hover:bg-[#C3E9F4] transition-colors"
              >
                <BrandIcon name="action-bank" className="w-4 h-4" />
                <span>Pilih dari Bank Daftar PDF (11 Grup)</span>
              </button>
              <button
                type="button"
                onClick={openAddForm}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B]"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Penerima Pertama</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5F1F5] bg-[#F4FBFD] text-[12px] font-semibold text-[#757E96]">
                  <th className="py-3 px-4 whitespace-nowrap">Kode</th>
                  <th className="py-3 px-4">Nama Penerima / Jabatan</th>
                  <th className="py-3 px-4">Instansi / Asal Daerah</th>
                  <th className="py-3 px-4 whitespace-nowrap">Kehadiran (RSVP)</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status PDF</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF6F9] text-[13px]">
                {paginatedRecipients.map((recipient) => {
                  const isBusy = downloadingId === recipient.id;
                  return (
                    <tr
                      key={recipient.id}
                      onClick={() => onPreviewRecipient(recipient)}
                      className="hover:bg-[#EBF8FC] transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-mono text-[12px] text-[#757E96] tabular-nums whitespace-nowrap">
                        <div>
                          <HighlightedText
                            text={recipient.invitationCode}
                            query={searchQuery}
                          />
                        </div>
                        {recipient.group && (
                          <div
                            title={recipient.group}
                            className="font-sans text-[11px] font-semibold text-[#1F9B96] max-w-[140px] truncate"
                          >
                            <HighlightedText
                              text={recipient.group}
                              query={searchQuery}
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        <div className="text-[11px] text-[#757E96] truncate">
                          {recipient.salutation}
                        </div>
                        <div
                          title={recipient.recipientName}
                          className="font-semibold text-[#1B1B4B] truncate"
                        >
                          <HighlightedText
                            text={recipient.recipientName}
                            query={searchQuery}
                          />
                        </div>
                      </td>
                      <td
                        title={recipient.institution}
                        className="py-3 px-4 text-[#757E96] max-w-[240px] truncate"
                      >
                        <HighlightedText
                          text={recipient.institution}
                          query={searchQuery}
                        />
                      </td>
                      <td className="py-3 px-4">
                        {recipient.rsvpStatus === 'attending' ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCF5F1] text-[12px] font-semibold text-[#157A76]">
                              <BrandIcon name="rsvp-attending" className="w-3.5 h-3.5" />
                              <span>Hadir</span>
                            </span>
                            {(recipient.rsvpRepresentative || recipient.rsvpNote) && (
                              <div className="text-[11px] text-[#757E96] truncate max-w-[190px] mt-0.5">
                                {recipient.rsvpRepresentative || recipient.rsvpNote}
                              </div>
                            )}
                          </div>
                        ) : recipient.rsvpStatus === 'represented' ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E3F5FA] text-[12px] font-semibold text-[#167F7B]">
                              <BrandIcon name="rsvp-represented" className="w-3.5 h-3.5" />
                              <span>Diwakilkan</span>
                            </span>
                            {recipient.rsvpRepresentative && (
                              <div className="text-[11px] text-[#757E96] truncate max-w-[190px] mt-0.5">
                                {recipient.rsvpRepresentative}
                              </div>
                            )}
                          </div>
                        ) : recipient.rsvpStatus === 'declined' ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FDE8EE] text-[12px] font-semibold text-[#B83B5E]">
                              <BrandIcon name="rsvp-declined" className="w-3.5 h-3.5" />
                              <span>Berhalangan</span>
                            </span>
                            {recipient.rsvpNote && (
                              <div className="text-[11px] text-[#757E96] truncate max-w-[190px] mt-0.5">
                                {recipient.rsvpNote}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F2F7FA] text-[12px] font-medium text-[#757E96]">
                            <BrandIcon name="rsvp-pending" className="w-3.5 h-3.5" />
                            <span>Belum Konfirmasi</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {recipient.status === 'generated' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCF5F1] text-[12px] font-semibold text-[#157A76]">
                            <BrandIcon name="status-check" className="w-3.5 h-3.5" />
                            <span>Generated</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF7D6] text-[12px] font-semibold text-[#9A7409]">
                            <BrandIcon name="rsvp-pending" className="w-3.5 h-3.5" />
                            <span>Ready</span>
                          </span>
                        )}
                      </td>
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSimulateRsvp(recipient)}
                            title="Simulasi Halaman Verifikasi Tamu (Scan QR)"
                            className="p-1.5 rounded-full text-[#757E96] hover:text-[#1F9B96] hover:bg-[#E3F5FA] transition-colors"
                          >
                            <BrandIcon name="action-qr" className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onPreviewRecipient(recipient)}
                            title="Pratinjau Undangan"
                            className="p-1.5 rounded-full text-[#757E96] hover:text-[#1F9B96] hover:bg-[#E3F5FA] transition-colors"
                          >
                            <BrandIcon name="action-eye" className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(recipient)}
                            title="Sunting Penerima"
                            className="p-1.5 rounded-full text-[#757E96] hover:text-[#1B1B4B] hover:bg-[#F2F7FA] transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onDownloadSinglePdf(recipient)}
                            title="Unduh PDF Satuan"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-semibold text-[#167F7B] bg-[#E3F5FA] hover:bg-[#CCEBF4] transition-colors disabled:opacity-50"
                          >
                            <BrandIcon name="action-download-doc" className="w-4 h-4" />
                            <span>{isBusy ? '...' : 'PDF'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRecipient(recipient.id)}
                            title="Hapus Penerima"
                            className="p-1.5 rounded-full text-[#757E96] hover:text-[#B83B5E] hover:bg-[#FDE8EE] transition-colors"
                          >
                            <BrandIcon name="action-trash" className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          currentPage={safePage}
          totalItems={displayedRecipients.length}
          pageSize={GUEST_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Column Mapping Modal for CSV / Excel Import */}
      {importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B1B4B]/45 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-[26px] bg-white shadow-2xl border border-[#E5F1F5] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDF6F9] bg-[#F4FBFD]">
              <div className="flex items-center gap-3 min-w-0">
                <IconBadge name="doc-upload" size="sm" />
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-[16px] text-[#1B1B4B] truncate">
                    Pemetaan Kolom Impor ({importData.fileName})
                  </h3>
                  <p className="text-[12px] text-[#757E96] tabular-nums">
                    {importData.rows.length} baris data ditemukan · Sesuaikan kolom sebelum mengimpor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportData(null)}
                className="p-2 rounded-full text-[#757E96] hover:bg-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(
                  [
                    { key: 'recipientName', label: 'Nama Penerima / Jabatan *' },
                    { key: 'institution', label: 'Instansi / Asal Daerah' },
                    { key: 'salutation', label: 'Sapaan (Kepada Yth.)' },
                    { key: 'placeLabel', label: 'Keterangan Tempat (di tempat)' },
                    { key: 'group', label: 'Kelompok / Grup (Opsional)' },
                    { key: 'invitationCode', label: 'ID Referensi QR (Opsional)' },
                  ] as { key: keyof ColumnMapping; label: string }[]
                ).map((field) => (
                  <div key={field.key}>
                    <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                      {field.label}
                    </label>
                    <select
                      value={importMapping[field.key]}
                      onChange={(e) =>
                        setImportMapping({
                          ...importMapping,
                          [field.key]: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                    >
                      <option value="">-- Lewati / Default --</option>
                      {importData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                <div>
                  <label className="block text-[12px] font-medium text-[#1B1B4B] mb-1">
                    Mode Impor Data
                  </label>
                  <select
                    value={importMode}
                    onChange={(e) =>
                      setImportMode(e.target.value as 'append' | 'replace')
                    }
                    className="w-full rounded-xl border border-[#DDEEF3] bg-white px-3 py-2 text-[13px] text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96]"
                  >
                    <option value="append">Tambahkan ke Daftar Saat Ini</option>
                    <option value="replace">Ganti Seluruh Daftar Penerima</option>
                  </select>
                </div>
              </div>

              {/* Sample 3 rows preview */}
              <div className="rounded-2xl border border-[#E5F1F5] overflow-hidden">
                <div className="bg-[#F4FBFD] px-3.5 py-2 text-[12px] font-semibold text-[#757E96] border-b border-[#E5F1F5]">
                  Pratinjau 3 Baris Pertama
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12px]">
                    <tbody className="divide-y divide-[#EDF6F9]">
                      {importData.rows.slice(0, 3).map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-[#757E96]">
                            {importMapping.salutation
                              ? row[importMapping.salutation] || 'Kepada Yth.'
                              : 'Kepada Yth.'}
                          </td>
                          <td className="py-2 px-3 font-semibold text-[#1B1B4B]">
                            {importMapping.recipientName
                              ? row[importMapping.recipientName] || '-'
                              : '-'}
                          </td>
                          <td className="py-2 px-3 text-[#757E96]">
                            {importMapping.institution
                              ? row[importMapping.institution] || '-'
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#EDF6F9] bg-[#F4FBFD]">
              <button
                type="button"
                onClick={() => setImportData(null)}
                className="px-4 py-2 rounded-full border border-[#DDEEF3] bg-white text-[13px] font-medium text-[#757E96] hover:bg-[#E3F5FA]/50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-full text-[13px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B]"
              >
                Impor {importData.rows.length} Penerima
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sequential Step Navigation */}
      <StepFooterNav
        prevLabel="Kembali: Info & Template"
        onPrev={() => onNavigate('setup')}
        nextLabel="Lanjut: Atur Tata Letak"
        onNext={() => onNavigate('layout')}
        nextHint={
          recipients.length > 0
            ? `Cek penempatan nama untuk ${recipients.length} penerima di kanvas`
            : 'Anda tetap dapat mengatur tata letak menggunakan nama contoh'
        }
        nextVariant="teal"
      />

      {/* Bank Daftar PDF Modal (Checklist Kelompok & Per Penerima) */}
      <PdfBankChecklistModal
        open={bankModalOpen}
        existingRecipients={recipients}
        onClose={() => setBankModalOpen(false)}
        onConfirmSelection={(selected, mode) => {
          onApplyPdfSelection(selected, mode);
          setCurrentPage(1);
        }}
        onSyncBankUpdates={onSyncBankUpdates}
        onNotify={onNotify}
      />
    </div>
  );
};
