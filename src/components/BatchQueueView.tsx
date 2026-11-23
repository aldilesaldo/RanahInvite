import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { EventMetadata, NavTab, Recipient, TemplateImages } from '../types';
import { buildSafePdfFilename, triggerBlobDownload } from '../utils/pdfEngine';
import { generateInvitationListReportPdf } from '../utils/reportPdf';
import { exportInvitationListReportExcel } from '../utils/reportExcel';
import { PaginationBar } from './PaginationBar';
import { CountUpNumber, HighlightedText, SmartMarqueeText } from './UiPolish';
import { BrandIcon, IconBadge } from './BrandIcon';
import { StepFooterNav } from './WorkflowStepperBar';

interface BatchQueueViewProps {
  metadata: EventMetadata;
  templates: TemplateImages;
  recipients: Recipient[];
  totalRecipientsCount: number;
  availableGroups: { name: string; count: number }[];
  groupFilter: string;
  onSelectGroupFilter: (group: string) => void;
  isGeneratingBatch: boolean;
  batchProcessedCount: number;
  batchTotalCount: number;
  currentGeneratingName: string;
  hasReadyZip: boolean;
  onStartBatchExport: () => void;
  onDownloadZipArchive: () => void;
  onDownloadSinglePdf: (recipient: Recipient) => void;
  onPreviewRecipient: (recipient: Recipient) => void;
  onNavigate: (tab: NavTab) => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
  downloadingId: string | null;
  searchQuery?: string;
}

export const BatchQueueView: React.FC<BatchQueueViewProps> = ({
  metadata,
  recipients,
  totalRecipientsCount,
  availableGroups,
  groupFilter,
  onSelectGroupFilter,
  isGeneratingBatch,
  batchProcessedCount,
  batchTotalCount,
  currentGeneratingName,
  hasReadyZip,
  onStartBatchExport,
  onDownloadZipArchive,
  onDownloadSinglePdf,
  onPreviewRecipient,
  onNavigate,
  onNotify,
  downloadingId,
  searchQuery = '',
}) => {
  const BATCH_PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [isExportingReportPdf, setIsExportingReportPdf] = useState(false);

  const progressPct =
    batchTotalCount > 0
      ? Math.round((batchProcessedCount / batchTotalCount) * 100)
      : 0;
  const generatedCount = recipients.filter((r) => r.status === 'generated').length;

  const computedFilenames = useMemo(() => {
    const used = new Set<string>();
    return recipients.map((rec) =>
      buildSafePdfFilename(
        metadata.eventName,
        rec.recipientName,
        rec.institution,
        used
      )
    );
  }, [recipients, metadata.eventName]);

  const totalPages = Math.max(1, Math.ceil(recipients.length / BATCH_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const visibleSlice = useMemo(() => {
    const start = (safePage - 1) * BATCH_PAGE_SIZE;
    return recipients
      .slice(start, start + BATCH_PAGE_SIZE)
      .map((rec, offset) => ({ rec, idx: start + offset }));
  }, [recipients, safePage]);

  const buildFilterSummary = () => {
    const parts: string[] = [];
    if (groupFilter !== 'Semua') parts.push(`Kelompok: ${groupFilter}`);
    if (searchQuery.trim()) parts.push(`Pencarian: "${searchQuery.trim()}"`);
    return parts.length > 0 ? parts.join(' | ') : 'Seluruh Daftar Penerima';
  };

  const handleExportReportPdf = async () => {
    if (recipients.length === 0 || isExportingReportPdf) return;
    setIsExportingReportPdf(true);
    try {
      const { bytes, filename } = await generateInvitationListReportPdf({
        metadata,
        recipients,
        filterSummary: buildFilterSummary(),
      });
      triggerBlobDownload(bytes, filename, 'application/pdf');
      onNotify?.(
        `Laporan PDF (${recipients.length} penerima) berhasil diekspor: ${filename}`
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
    if (recipients.length === 0) return;
    try {
      const { filename } = exportInvitationListReportExcel({
        metadata,
        recipients,
        filterSummary: buildFilterSummary(),
      });
      onNotify?.(
        `Laporan Excel (${recipients.length} penerima) berhasil diekspor: ${filename}`
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
      {/* Step Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EDF6F9] pb-4">
        <div className="flex items-center gap-3">
          <IconBadge name="nav-export-pdf" size="md" />
          <div>
            <div className="text-[11.5px] font-semibold text-[#1F9B96]">
              Tahap 4 dari 4
            </div>
            <h2 className="font-display font-bold text-[20px] text-[#1B1B4B] leading-tight">
              Generate PDF &amp; Laporan Resmi
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasReadyZip && !isGeneratingBatch && (
            <button
              type="button"
              onClick={onDownloadZipArchive}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F9DE6C] hover:bg-[#F3D34F] text-[13px] font-semibold text-[#1B1B4B] transition-colors shadow-xs whitespace-nowrap"
            >
              <BrandIcon name="action-download" className="w-5 h-5 text-[#1B1B4B]" />
              <span>Unduh Arsip .ZIP</span>
            </button>
          )}

          <button
            type="button"
            disabled={recipients.length === 0 || isGeneratingBatch}
            onClick={onStartBatchExport}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1F9B96] hover:bg-[#167F7B] text-[13px] font-semibold text-white transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isGeneratingBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Merender PDF...</span>
              </>
            ) : (
              <>
                <BrandIcon name="nav-export-pdf" white className="w-5 h-5" />
                <span>Generate Semua PDF ({recipients.length})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unified 2-Column Executive Control Strip: Target Kelompok + Render Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left: Target Kelompok Ekspor (PinHome Ice Sky Surface) */}
        <div className="lg:col-span-5 rounded-[22px] border border-[#B5E4F1] bg-[#E3F5FA] p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="batch-group-filter"
              className="inline-flex items-center gap-2 text-[13px] font-display font-bold text-[#1B1B4B]"
            >
              <IconBadge name="action-database" size="xs" />
              <span>Target Kelompok Ekspor</span>
            </label>
            <span className="text-[12px] font-semibold text-[#167F7B] tabular-nums whitespace-nowrap">
              <CountUpNumber value={recipients.length} /> berkas PDF
            </span>
          </div>

          <select
            id="batch-group-filter"
            disabled={isGeneratingBatch}
            value={groupFilter}
            onChange={(e) => {
              onSelectGroupFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-full border border-[#B5E4F1] bg-white px-4 py-2 text-[13px] font-medium text-[#1B1B4B] focus:outline-none focus:ring-2 focus:ring-[#1F9B96] disabled:opacity-60"
          >
            <option value="Semua">Semua Kelompok ({totalRecipientsCount})</option>
            {availableGroups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} ({g.count})
              </option>
            ))}
          </select>
        </div>

        {/* Right: Smooth Progress & Status Panel (PinHome Mint accent when ZIP ready) */}
        <div
          className={`lg:col-span-7 rounded-[22px] border p-4 flex flex-col justify-between gap-3 transition-colors ${
            hasReadyZip && !isGeneratingBatch
              ? 'border-[#B5E9E0] bg-[#E0F6F2]'
              : 'border-[#E5F1F5] bg-white'
          }`}
        >
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <IconBadge
                name={hasReadyZip && !isGeneratingBatch ? 'status-check' : 'brand-ticket'}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-display font-bold text-[#1B1B4B]">
                  <SmartMarqueeText
                    text={
                      isGeneratingBatch
                        ? `Sedang merender: ${currentGeneratingName}`
                        : metadata.eventName
                    }
                  />
                </h3>
                <div className="text-[12px] text-[#757E96] mt-0.5 tabular-nums truncate">
                  {hasReadyZip && !isGeneratingBatch
                    ? 'Semua PDF selesai dibuat & siap diunduh sebagai arsip .ZIP'
                    : `${generatedCount} dari ${recipients.length} undangan berstatus Generated`}
                </div>
              </div>
            </div>

            <div className="font-display font-bold text-[18px] text-[#1F9B96] tabular-nums shrink-0">
              {isGeneratingBatch ? (
                <CountUpNumber value={progressPct} duration={260} suffix="%" />
              ) : (
                <>
                  <CountUpNumber value={generatedCount} />/
                  <CountUpNumber value={recipients.length} />
                </>
              )}
            </div>
          </div>

          <div className="w-full h-2.5 rounded-full bg-[#E3F5FA] overflow-hidden">
            <motion.div
              className="relative h-full rounded-full overflow-hidden"
              style={{
                backgroundColor:
                  hasReadyZip && !isGeneratingBatch ? '#157A76' : '#1F9B96',
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${
                  isGeneratingBatch
                    ? progressPct
                    : recipients.length > 0
                      ? Math.round((generatedCount / recipients.length) * 100)
                      : 0
                }%`,
              }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {isGeneratingBatch && (
                <div
                  aria-hidden="true"
                  className="progress-shimmer-sheen absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                />
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Official Reports Export Strip (PDF & Excel) */}
      <div className="rounded-[22px] border border-[#DFEFF4] bg-[#F4FBFD] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-bold text-[14px] text-[#1B1B4B]">
            Rekap &amp; Laporan Daftar Undangan
          </div>
          <div className="text-[12px] text-[#757E96]">
            Unduh rekap resmi penerima beserta status RSVP dalam format PDF (A4) atau Excel (.xlsx)
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportReportPdf}
            disabled={recipients.length === 0 || isExportingReportPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#1F9B96] text-white text-[12px] font-semibold hover:bg-[#167F7B] disabled:opacity-45 disabled:cursor-not-allowed transition-colors shadow-xs whitespace-nowrap"
          >
            <BrandIcon name="doc-pdf" white className="w-4 h-4" />
            <span>{isExportingReportPdf ? 'Membuat PDF...' : 'Laporan PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportReportExcel}
            disabled={recipients.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F9DE6C] text-[#1B1B4B] text-[12px] font-semibold hover:bg-[#F3D34F] disabled:opacity-45 disabled:cursor-not-allowed transition-colors shadow-xs whitespace-nowrap"
          >
            <BrandIcon name="action-download-doc" className="w-4 h-4 text-[#1B1B4B]" />
            <span>Laporan XLS</span>
          </button>
        </div>
      </div>

      {/* Output Queue Table */}
      <div className="rounded-[22px] border border-[#E5F1F5] bg-white overflow-hidden">
        {recipients.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="font-display font-bold text-[15px] text-[#1B1B4B]">
              Belum ada penerima undangan untuk digenerate
            </p>
            <p className="text-[13px] text-[#757E96] mt-1 mb-4">
              Tambahkan daftar tamu terlebih dahulu di Tahap 2 melalui Bank Daftar PDF, impor Excel, atau input manual.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('guests')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white bg-[#1F9B96] hover:bg-[#167F7B] transition-colors"
            >
              <BrandIcon name="nav-guests" white className="w-4.5 h-4.5" />
              <span>Isi Daftar Penerima (Tahap 2)</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5F1F5] bg-[#F4FBFD] text-[12px] font-semibold text-[#757E96]">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Penerima &amp; Instansi</th>
                  <th className="py-3 px-4">Nama Berkas PDF Otomatis</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF6F9] text-[13px]">
                {visibleSlice.map(({ rec, idx }) => {
                  const autoFilename = computedFilenames[idx];
                  const isItemBusy =
                    rec.status === 'generating' || downloadingId === rec.id;

                  return (
                    <tr
                      key={rec.id}
                      onClick={() => onPreviewRecipient(rec)}
                      className="hover:bg-[#EBF8FC] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-[12px] text-[#757E96] tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 max-w-[260px]">
                        <div
                          title={rec.recipientName}
                          className="font-semibold text-[#1B1B4B] truncate"
                        >
                          <HighlightedText
                            text={rec.recipientName}
                            query={searchQuery}
                          />
                        </div>
                        <div
                          title={rec.institution}
                          className="text-[12px] text-[#757E96] truncate"
                        >
                          <HighlightedText
                            text={rec.institution}
                            query={searchQuery}
                          />
                        </div>
                      </td>
                      <td
                        title={autoFilename}
                        className="py-3 px-4 font-mono text-[12px] text-[#757E96] max-w-[320px] truncate"
                      >
                        {autoFilename}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {rec.status === 'generated' ? (
                          <motion.span
                            key="generated"
                            initial={{ scale: 0.88, opacity: 0.7 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#DCF5F1] text-[12px] font-semibold text-[#157A76]"
                          >
                            <BrandIcon name="status-check" className="w-3.5 h-3.5" />
                            <span>Generated</span>
                          </motion.span>
                        ) : rec.status === 'generating' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E3F5FA] text-[12px] font-semibold text-[#167F7B]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Rendering</span>
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
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onPreviewRecipient(rec)}
                            title="Pratinjau Undangan"
                            className="p-1.5 rounded-full text-[#757E96] hover:text-[#1F9B96] hover:bg-[#E3F5FA] transition-colors"
                          >
                            <BrandIcon name="action-eye" className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isItemBusy || isGeneratingBatch}
                            onClick={() => onDownloadSinglePdf(rec)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-[#167F7B] bg-[#E3F5FA] hover:bg-[#CCEBF4] transition-colors disabled:opacity-50"
                          >
                            {isItemBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <BrandIcon name="action-download-doc" className="w-4 h-4" />
                            )}
                            <span>Unduh PDF</span>
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
          totalItems={recipients.length}
          pageSize={BATCH_PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Sequential Step Footer */}
      <StepFooterNav
        prevLabel="Kembali: Tata Letak"
        onPrev={() => onNavigate('layout')}
        nextLabel="Selesai · Beranda Event"
        onNext={() => onNavigate('dashboard')}
        nextHint="Kelola event lain atau pantau ringkasan RSVP"
        nextVariant="teal"
      />
    </div>
  );
};
