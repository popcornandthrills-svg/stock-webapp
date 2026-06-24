"use client";

import { useMemo, useRef, useState } from "react";

type InvoiceItem = {
  item: string;
  type?: string;
  qty: number;
  rate: number;
  gst: number;
};

export type InvoiceData = {
  invoiceNo: string;
  invoiceDate: string;
  branch: string;
  priceType: string;
  customer: string;
  address: string;
  phone: string;
  paymentMode: string;
  gstNumber?: string;
  companyAddress?: string;
  subtitle?: string;
  logoUrl?: string;
  items: InvoiceItem[];
  taxable?: number;
  discount?: number;
  tds?: number;
  paid?: number;
  note?: string;
};

const sampleInvoice: InvoiceData = {
  invoiceNo: "H.O-0017",
  invoiceDate: "07-05-2026 05:30 PM",
  branch: "H.O",
  priceType: "Retail",
  customer: "RAKSHITH",
  address: "9-2554, SUKARLABAD",
  phone: "9561245124",
  paymentMode: "Cash",
  gstNumber: "GSTIN: 37ABCDE1234F1Z5",
  companyAddress: "JEWELL INDUSTRY INDIA PVT. LTD. | SINCE 1995 | HYDERABAD",
  subtitle: "Premium Jewellery Billing",
  items: [{ item: "124141 - HARAM", type: "Nos", qty: 20, rate: 1828, gst: 18 }],
  taxable: 36560,
  discount: 0,
  tds: 0,
  paid: 0,
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function calcSummary(data: InvoiceData) {
  const taxable = data.taxable ?? data.items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const cgst = (taxable * 18) / 100 / 2;
  const sgst = (taxable * 18) / 100 / 2;
  const subtotal = taxable + cgst + sgst;
  const discount = data.discount ?? 0;
  const tds = data.tds ?? 0;
  const roundOff = Math.round(subtotal - discount - tds) - (subtotal - discount - tds);
  const grandTotal = subtotal - discount - tds + roundOff;
  const paid = data.paid ?? 0;
  const due = grandTotal - paid;
  return { taxable, cgst, sgst, subtotal, discount, tds, roundOff, grandTotal, paid, due };
}

export function InvoiceHeader({ data }: { data: InvoiceData }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-stone-200 pb-4 print:border-stone-300">
      <div className="max-w-[58%]">
        <h1 className="text-4xl font-bold tracking-wide text-[#D4AF37] print:text-[31px]">
          GOLDPRINCE
        </h1>
        <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-slate-700">
          {data.subtitle || "Premium Jewellery Billing"}
        </p>
        <p className="mt-1 text-[12px] text-slate-600">
          {data.companyAddress || "JEWELL INDUSTRY INDIA PVT. LTD. | SINCE 1995"}
        </p>
        <p className="mt-1 text-[12px] text-slate-600">{data.gstNumber || "GSTIN: 37ABCDE1234F1Z5"}</p>
      </div>

      <div className="min-w-[260px] text-right text-[13px] leading-6 text-slate-800">
        <div>
          <span className="font-semibold">Invoice No:</span> {data.invoiceNo}
        </div>
        <div>
          <span className="font-semibold">Invoice Date:</span> {data.invoiceDate}
        </div>
        <div>
          <span className="font-semibold">Branch:</span> {data.branch}
        </div>
        <div>
          <span className="font-semibold">Price Type:</span> {data.priceType}
        </div>
      </div>
    </header>
  );
}

export function CustomerInfo({ data }: { data: InvoiceData }) {
  return (
    <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm print:bg-slate-50">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="text-[13px] text-slate-800">
          <span className="font-semibold">Customer Name:</span> {data.customer}
        </div>
        <div className="text-[13px] text-slate-800">
          <span className="font-semibold">Phone Number:</span> {data.phone}
        </div>
        <div className="text-[13px] text-slate-800">
          <span className="font-semibold">Address:</span> {data.address}
        </div>
        <div className="text-[13px] text-slate-800">
          <span className="font-semibold">Payment Mode:</span> {data.paymentMode}
        </div>
      </div>
    </section>
  );
}

export function InvoiceTable({ items }: { items: InvoiceItem[] }) {
  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr className="text-left text-slate-700">
              <th className="border-b border-slate-300 px-3 py-3 font-semibold">SR</th>
              <th className="border-b border-slate-300 px-3 py-3 font-semibold">Item</th>
              <th className="border-b border-slate-300 px-3 py-3 font-semibold">Type</th>
              <th className="border-b border-slate-300 px-3 py-3 font-semibold text-right">Qty</th>
              <th className="border-b border-slate-300 px-3 py-3 font-semibold text-right">Rate</th>
              <th className="border-b border-slate-300 px-3 py-3 font-semibold text-right">GST %</th>
              <th className="border-b border-slate-300 px-3 py-3 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, index) => {
              const amount = row.qty * row.rate + (row.qty * row.rate * row.gst) / 100;
              return (
                <tr
                  key={`${row.item}-${index}`}
                  className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="border-b border-slate-200 px-3 py-3">{index + 1}</td>
                  <td className="border-b border-slate-200 px-3 py-3">{row.item}</td>
                  <td className="border-b border-slate-200 px-3 py-3">{row.type || "Nos"}</td>
                  <td className="border-b border-slate-200 px-3 py-3 text-right">{row.qty}</td>
                  <td className="border-b border-slate-200 px-3 py-3 text-right">{formatMoney(row.rate)}</td>
                  <td className="border-b border-slate-200 px-3 py-3 text-right">{Number(row.gst ?? 0).toFixed(2)}</td>
                  <td className="border-b border-slate-200 px-3 py-3 text-right">{formatMoney(amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function InvoiceSummary({ summary }: { summary: ReturnType<typeof calcSummary> }) {
  const rows = [
    ["Taxable", summary.taxable],
    ["CGST", summary.cgst],
    ["SGST", summary.sgst],
    ["Subtotal", summary.subtotal],
    ["Discount", summary.discount],
    ["TDS", summary.tds],
    ["Round Off", summary.roundOff],
    ["Grand Total", summary.grandTotal],
    ["Paid", summary.paid],
    ["Due", summary.due],
  ] as const;

  return (
    <section className="mt-5 flex justify-end">
      <div className="w-full max-w-[360px]">
        <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className={`flex items-center justify-between gap-4 text-[13px] ${
                label === "Grand Total" ? "border-t border-slate-300 pt-3 text-[16px] font-bold" : ""
              }`}
            >
              <span>{label}</span>
              <strong>{formatMoney(value)}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function InvoiceFooter() {
  return <footer className="mt-7 text-center text-[12px] text-slate-500">Generated from GOLDPRINCE</footer>;
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 print:hidden"
    >
      {children}
    </button>
  );
}

export default function InvoicePage() {
  const [data, setData] = useState<InvoiceData>(sampleInvoice);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const summary = useMemo(() => calcSummary(data), [data]);

  const handlePrint = () => window.print();

  const handleDownloadPdf = () => {
    window.print();
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Invoice ${data.invoiceNo}`);
    const body = encodeURIComponent(`Please find invoice ${data.invoiceNo} attached.\n\nCustomer: ${data.customer}\nTotal: ${formatMoney(summary.grandTotal)}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleShare = async () => {
    const shareData = {
      title: `Invoice ${data.invoiceNo}`,
      text: `Invoice ${data.invoiceNo} for ${data.customer} | Grand Total ${formatMoney(summary.grandTotal)}`,
    };
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}`);
  };

  const handleLogoUpload = () => fileRef.current?.click();

  const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  return (
    <main className="min-h-screen bg-[#f4f1e8] px-3 py-4 text-slate-900 print:bg-white print:p-0">
      <div className="mx-auto w-full max-w-[210mm] rounded-2xl bg-white px-5 py-5 shadow-[0_18px_50px_rgba(85,74,44,0.16)] print:mx-0 print:max-w-none print:rounded-none print:shadow-none">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={handlePrint}>Print Invoice</ActionButton>
            <ActionButton onClick={handleDownloadPdf}>Download PDF</ActionButton>
            <ActionButton onClick={handleEmail}>Email Invoice</ActionButton>
            <ActionButton onClick={handleShare}>Share Invoice</ActionButton>
            <ActionButton onClick={handleLogoUpload}>Company Logo Upload</ActionButton>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        </div>

        <div className="mb-4 rounded-xl border border-stone-200 bg-gradient-to-b from-white to-[#fdfbf6] p-3 shadow-sm">
          {logoPreview ? (
            <img src={logoPreview} alt="Company logo" className="mb-3 h-14 w-auto object-contain" />
          ) : null}
          <InvoiceHeader data={data} />
        </div>

        <CustomerInfo data={data} />
        <InvoiceTable items={data.items} />
        <InvoiceSummary summary={summary} />
        <InvoiceFooter />
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 10mm;
        }
        @media print {
          body {
            background: #fff !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
