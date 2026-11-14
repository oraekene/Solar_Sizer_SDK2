// The scraper review queue. It sits in the admin Database tab. The list shows
// every candidate that waits for a human, the detail modal shows the offers
// behind the price, and the actions approve, reject, edit, merge and publish.
// See docs/scraper-design.md section 6.2.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, Link2, Pencil, RefreshCw, X } from 'lucide-react';
import { missingSpecs, REQUIRED_SPECS } from '../../scraper/rules.ts';

type Candidate = {
  id: string;
  canonical_id: string | null;
  bucket_key: string | null;
  current_hardware_row: string | null;
  product_type: string;
  status: string;
  proposed_data: Record<string, unknown>;
  proposed_price: number | null;
  current_price: number | null;
  offer_ids: string[];
  source_urls: string[];
  provenance: Array<Record<string, unknown>>;
  risk_flags: string[];
};

type Offer = {
  id: string;
  source_site: string;
  source_url: string;
  seller_name: string | null;
  price: number | null;
  unit_basis: string | null;
  condition: string;
  in_stock: string;
  trust_tier: string;
  last_checked: string | null;
  status: string;
  reason_code: string | null;
};

export type MergeTarget = { id: string; name: string; type: string };

const naira = (value: number | null | undefined) =>
  value === null || value === undefined ? '-' : `₦${Math.round(value).toLocaleString('en-NG')}`;

const ago = (value: string | null) => {
  if (!value) return 'never';
  const hours = Math.round((Date.now() - Date.parse(value)) / 3600000);
  if (!Number.isFinite(hours)) return 'unknown';
  if (hours <= 0) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const specLine = (data: Record<string, unknown>) => {
  if (typeof data.watts === 'number') return `${data.watts} W`;
  if (typeof data.voltage === 'number' && typeof data.capacity_ah === 'number') {
    return `${data.voltage} V, ${data.capacity_ah} Ah`;
  }
  return 'no size yet';
};

export default function ScraperReview({
  adminKey,
  targets,
  onPublished,
}: {
  adminKey: string;
  targets: MergeTarget[];
  onPublished?: () => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [filter, setFilter] = useState('pending_review');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [mergeId, setMergeId] = useState('');

  const load = useCallback(async () => {
    const headers = { 'x-admin-key': adminKey };
    const [candidateResponse, offerResponse] = await Promise.all([
      fetch('/api/scraper/candidates?limit=500', { headers }),
      fetch('/api/scraper/offers?limit=500', { headers }),
    ]);
    if (!candidateResponse.ok || !offerResponse.ok) {
      setMessage('The Worker refused the request. Unlock admin mode again.');
      return;
    }
    setCandidates(await candidateResponse.json());
    setOffers(await offerResponse.json());
  }, [adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  const offersById = useMemo(() => {
    const map = new Map<string, Offer>();
    for (const offer of offers) map.set(offer.id, offer);
    return map;
  }, [offers]);

  const pending = candidates.filter((candidate) => candidate.status === 'pending_review');
  const visible = filter === 'all' ? candidates : candidates.filter((candidate) => candidate.status === filter);

  const review = async (ids: string[], status: 'approved' | 'rejected' | 'duplicate', reason?: string) => {
    const response = await fetch('/api/scraper/candidates/review', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
      body: JSON.stringify({ ids, status, reviewer: 'admin', reason }),
    });
    if (!response.ok) {
      setMessage('The review action failed.');
      return false;
    }
    await load();
    setSelected((current) =>
      current && ids.includes(current.id) ? { ...current, status } : current,
    );
    return true;
  };

  // The edit and the merge both write the candidate back. The Worker keeps a
  // decided status, so an edit never sends a rejected candidate back to the
  // queue.
  const saveCandidate = async (
    candidate: Candidate,
    changes: { proposed_data?: Record<string, unknown>; proposed_price?: number | null; current_hardware_row?: string | null },
  ) => {
    const response = await fetch('/api/scraper/candidates', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        candidates: [
          {
            id: candidate.id,
            canonical_id: candidate.canonical_id,
            bucket_key: candidate.bucket_key,
            current_hardware_row: changes.current_hardware_row ?? candidate.current_hardware_row,
            product_type: candidate.product_type,
            status: candidate.status,
            proposed_data: changes.proposed_data ?? candidate.proposed_data,
            proposed_price: changes.proposed_price ?? candidate.proposed_price,
            current_price: candidate.current_price,
            offer_ids: candidate.offer_ids,
            source_urls: candidate.source_urls,
            provenance: candidate.provenance,
          },
        ],
      }),
    });
    if (!response.ok) {
      setMessage('The candidate could not be saved.');
      return false;
    }
    await load();
    return true;
  };

  const publish = async (candidate: Candidate, acceptManual = false) => {
    const response = await fetch(`/api/scraper/candidates/${encodeURIComponent(candidate.id)}/publish`, {
      method: 'POST',
      headers: { 'x-admin-key': adminKey, 'content-type': 'application/json' },
      body: JSON.stringify({ reviewer: 'admin', accept_manual: acceptManual }),
    });
    if (response.status === 409) {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        current_price?: number | null;
        proposed_price?: number | null;
      };
      if (body.error === 'manual-row') {
        const replace = confirm(
          `This row has a manual price of ${naira(body.current_price)}. Replace it with the scraped median of ${naira(body.proposed_price)}?`,
        );
        if (replace) await publish(candidate, true);
        return;
      }
      setMessage(body.message ?? 'The candidate could not be published.');
      return;
    }
    if (!response.ok) {
      setMessage('The publish failed.');
      return;
    }
    setMessage(`Published ${candidate.id}.`);
    setSelected(null);
    await load();
    onPublished?.();
  };

  const startEdit = (candidate: Candidate) => {
    const values: Record<string, string> = {};
    for (const field of ['name', 'price', ...(REQUIRED_SPECS[candidate.product_type] ?? [])]) {
      const value = candidate.proposed_data[field];
      values[field] = value === undefined || value === null ? '' : String(value);
    }
    setEditData(values);
    setMergeId(candidate.current_hardware_row ?? '');
  };

  const saveEdit = async (candidate: Candidate) => {
    const fields = REQUIRED_SPECS[candidate.product_type] ?? [];
    const data = { ...candidate.proposed_data };
    for (const field of ['name', ...fields]) {
      const raw = (editData[field] ?? '').trim();
      if (raw === '') {
        delete data[field];
        continue;
      }
      if (field !== 'name' && field !== 'type' && !Number.isFinite(Number(raw))) {
        setMessage(`${field} must be a number.`);
        return;
      }
      data[field] = field === 'name' || field === 'type' ? raw : Number(raw);
    }

    const priceRaw = (editData.price ?? '').trim();
    const price = priceRaw === '' ? null : Number(priceRaw);
    if (price !== null && !Number.isFinite(price)) {
      setMessage('The price must be a number.');
      return;
    }
    if (price !== null) data.price = price;

    const saved = await saveCandidate(candidate, {
      proposed_data: data,
      proposed_price: price,
    });
    if (saved) setMessage('The candidate was updated.');
  };

  const saveMerge = async (candidate: Candidate) => {
    if (!mergeId) return;
    const saved = await saveCandidate(candidate, { current_hardware_row: mergeId });
    if (saved) setMessage(`The candidate now points at ${mergeId}.`);
  };

  const selectedOffers = selected
    ? selected.offer_ids.map((id) => offersById.get(id)).filter((offer): offer is Offer => Boolean(offer))
    : [];

  // The calculator reads these fields, so a row without them never goes live.
  const selectedMissing = selected ? missingSpecs(selected.product_type, selected.proposed_data) : [];

  const bulkApprove = async () => {
    if (checked.length === 0) return;
    const groups = new Set(checked.map((id) => candidates.find((c) => c.id === id)?.canonical_id));
    if (groups.size > 1 && !confirm('The selected candidates are not the same product. Approve them all?')) {
      return;
    }
    setBusy(true);
    const done = await review(checked, 'approved');
    setBusy(false);
    if (done) {
      setChecked([]);
      setMessage(`${checked.length} candidates approved.`);
    }
  };

  const reject = async (candidate: Candidate) => {
    const reason = prompt('Why is this candidate rejected?');
    if (reason === null) return;
    setBusy(true);
    await review([candidate.id], 'rejected', reason);
    setBusy(false);
    setSelected(null);
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
      <div className="p-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-stone-900 text-white hover:bg-stone-800 transition-all"
        >
          <ClipboardList className="w-4 h-4" /> Scraper review
        </button>
        {pending.length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
            {pending.length} waiting
          </span>
        )}
        {open && (
          <>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="px-3 py-2 rounded-xl text-sm border border-stone-200 bg-stone-50"
            >
              <option value="pending_review">Waiting for review</option>
              <option value="suggested">Suggested</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
              <option value="duplicate">Duplicate</option>
              <option value="all">All</option>
            </select>
            <button
              onClick={load}
              className="px-3 py-2 rounded-xl text-sm font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {checked.length > 0 && (
              <button
                onClick={bulkApprove}
                disabled={busy}
                className="px-3 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                Approve {checked.length} selected
              </button>
            )}
          </>
        )}
        {message && <span className="text-xs text-stone-500">{message}</span>}
      </div>

      {open && (
        <div className="border-t border-stone-100 overflow-x-auto">
          {visible.length === 0 ? (
            <p className="p-6 text-sm text-stone-500">No candidate with this status.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="p-3 w-8"></th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Proposed price</th>
                  <th className="p-3">Sources</th>
                  <th className="p-3">Checked</th>
                  <th className="p-3">Flags</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((candidate) => {
                  const candidateOffers = candidate.offer_ids
                    .map((id) => offersById.get(id))
                    .filter((offer): offer is Offer => Boolean(offer));
                  const sources = [...new Set(candidateOffers.map((offer) => offer.source_site))];
                  const checkedAt = candidateOffers
                    .map((offer) => offer.last_checked)
                    .filter((value): value is string => Boolean(value))
                    .sort()
                    .pop();
                  return (
                    <tr key={candidate.id} className="border-t border-stone-100">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={checked.includes(candidate.id)}
                          onChange={(event) =>
                            setChecked((previous) =>
                              event.target.checked
                                ? [...previous, candidate.id]
                                : previous.filter((id) => id !== candidate.id),
                            )
                          }
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-stone-800">
                          {String(candidate.proposed_data.name ?? candidate.canonical_id)}
                        </div>
                        <div className="text-xs text-stone-500">{candidate.id}</div>
                      </td>
                      <td className="p-3 text-stone-600">{specLine(candidate.proposed_data)}</td>
                      <td className="p-3 font-bold">{naira(candidate.proposed_price)}</td>
                      <td className="p-3 text-stone-600">{sources.join(', ') || '-'}</td>
                      <td className="p-3 text-stone-600">{ago(checkedAt)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(candidate.risk_flags ?? []).map((flag) => (
                            <span
                              key={flag}
                              className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold"
                            >
                              {flag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => {
                            startEdit(candidate);
                            setSelected(candidate);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition-all"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-stone-100 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-xl">{String(selected.proposed_data.name ?? selected.id)}</h3>
                <p className="text-xs text-stone-500">
                  {selected.id} · {selected.product_type} · {specLine(selected.proposed_data)}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 hover:bg-stone-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-stone-50 rounded-xl p-3">
                  <div className="text-xs uppercase tracking-wider text-stone-500">Proposed</div>
                  <div className="font-bold">{naira(selected.proposed_price)}</div>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <div className="text-xs uppercase tracking-wider text-stone-500">Current row</div>
                  <div className="font-bold">{naira(selected.current_price)}</div>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <div className="text-xs uppercase tracking-wider text-stone-500">Status</div>
                  <div className="font-bold">{selected.status}</div>
                </div>
                <div className="bg-stone-50 rounded-xl p-3">
                  <div className="text-xs uppercase tracking-wider text-stone-500">Row</div>
                  <div className="font-bold text-xs break-all">{selected.current_hardware_row ?? 'new'}</div>
                </div>
              </div>

              {selected.risk_flags?.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{selected.risk_flags.join(' · ')}</span>
                </div>
              )}

              {selectedMissing.length > 0 && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Fill in {selectedMissing.join(', ')} before this row goes live.</span>
                </div>
              )}

              <div>
                <h4 className="font-bold text-sm mb-2">Offers</h4>
                <div className="space-y-2">
                  {selectedOffers.map((offer) => (
                    <div
                      key={offer.id}
                      className="flex items-center gap-3 text-sm bg-stone-50 rounded-xl px-3 py-2 flex-wrap"
                    >
                      <div className="font-bold w-28">{naira(offer.price)}</div>
                      <div className="text-stone-600 w-40 truncate">{offer.seller_name ?? 'Unknown seller'}</div>
                      <div className="text-stone-500">{offer.source_site}</div>
                      <div className="text-stone-500">{offer.condition}</div>
                      <div className="text-stone-500">{offer.trust_tier}</div>
                      <div className="text-stone-500">
                        {offer.in_stock === 'true' ? 'in stock' : offer.in_stock === 'false' ? 'out of stock' : 'stock unknown'}
                      </div>
                      <div className="text-stone-500">checked {ago(offer.last_checked)}</div>
                      {offer.status !== 'qualified' && (
                        <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 text-[10px] font-bold">
                          {offer.reason_code ?? offer.status}
                        </span>
                      )}
                      <a
                        href={offer.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-emerald-600 hover:text-emerald-700"
                        title="Open the listing"
                      >
                        <Link2 className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                  {selectedOffers.length === 0 && (
                    <p className="text-sm text-stone-500">No offer is linked to this candidate.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {['name', 'price', ...(REQUIRED_SPECS[selected.product_type] ?? [])].map((field) => (
                    <div key={field}>
                      <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                        {field.replace(/_/g, ' ')}
                      </label>
                      <input
                        type={field === 'name' ? 'text' : 'number'}
                        value={editData[field] ?? ''}
                        onChange={(event) =>
                          setEditData((previous) => ({ ...previous, [field]: event.target.value }))
                        }
                        className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => saveEdit(selected)}
                    disabled={busy}
                    className="px-3 py-2 rounded-xl text-sm font-bold bg-stone-900 text-white hover:bg-stone-800 transition-all flex items-center gap-2"
                  >
                    <Pencil className="w-4 h-4" /> Save the edit
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                    Merge into an existing row
                  </label>
                  <select
                    value={mergeId}
                    onChange={(event) => setMergeId(event.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl"
                  >
                    <option value="">New row</option>
                    {targets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name} ({target.type})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => saveMerge(selected)}
                    disabled={busy || !mergeId}
                    className="px-3 py-2 rounded-xl text-sm font-bold bg-stone-100 text-stone-800 hover:bg-stone-200 transition-all disabled:opacity-50"
                  >
                    Save the merge
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-stone-100 flex flex-wrap gap-3">
              <button
                onClick={async () => {
                  setBusy(true);
                  await review([selected.id], 'approved');
                  setBusy(false);
                }}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => publish(selected)}
                disabled={busy || selectedMissing.length > 0}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-stone-900 text-white hover:bg-stone-800 transition-all disabled:opacity-50"
              >
                Publish
              </button>
              <button
                onClick={() => reject(selected)}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-all disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  await review([selected.id], 'duplicate');
                  setBusy(false);
                  setSelected(null);
                }}
                disabled={busy}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-all disabled:opacity-50"
              >
                Mark as duplicate
              </button>
              <button
                onClick={() => setSelected(null)}
                className="ml-auto px-4 py-2.5 rounded-xl text-sm font-bold bg-stone-50 text-stone-600 hover:bg-stone-100 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
