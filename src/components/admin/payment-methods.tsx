"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { paymentMethodsSchema, type PaymentMethod } from "@/modules/admin/payment-methods";

const labels = { BANK: "Bank transfer", BKASH_PERSONAL: "bKash personal", BKASH_MERCHANT: "bKash merchant", NAGAD: "Nagad" };
export function PaymentMethods({refresh}: {refresh: number}) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch<{methods: PaymentMethod[]}>("admin/payment-methods").then(({data}) => {
      if (active) {setMethods(data.methods); setDirty(false); setError(""); setLoaded(true);}
    }).catch(e => {if(active) setError(e.message);}).finally(() => {if(active) setLoading(false);});
    return () => {active = false;};
  }, [refresh]);
  function update(id: string, patch: Partial<PaymentMethod>) {
    setMethods(rows => rows.map(row => row.id === id ? {...row, ...patch} : row));
    setDirty(true); setNotice("");
  }
  async function save() {
    const parsed = paymentMethodsSchema.safeParse({methods});
    if (!parsed.success) {setError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")); return;}
    setPending(true); setError(""); setNotice("");
    try {await apiFetch("admin/payment-methods", {method: "PATCH", body: JSON.stringify(parsed.data)}); setDirty(false); setNotice("Payment methods saved.");}
    catch(e) {setError(e instanceof Error ? e.message : "Could not save payment methods.");}
    finally {setPending(false);}
  }
  if (loading) return <p role="status">Loading payment methods…</p>;
  return <section>
    <p className="admin-note">Set up receiving accounts for bank transfer, bKash and Nagad. These settings do not verify payments or activate subscriptions. Customer checkout is not enabled by adding an account. Never enter a PIN, OTP, password or card secret.</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {notice && <p className="admin-toast" role="status">{notice}</p>}
    <div className="admin-toolbar">
      <button className="admin-button" disabled={!loaded || pending || methods.length >= 30} onClick={() => {setMethods(rows => [...rows, {id: crypto.randomUUID(), type: "BANK", label: "Bank transfer", enabled: false, accountName: "", accountNumber: "", bankName: "", branch: "", routingNumber: "", instructions: ""}]); setDirty(true); setNotice("");}}>+ Add payment method</button>
      <button className="admin-button primary" disabled={!loaded || pending || !dirty} onClick={() => void save()}>{pending ? "Saving…" : "Save payment methods"}</button>
      {dirty && <span role="status">Unsaved changes</span>}
    </div>
    {!methods.length && <p>No payment methods yet. Add a bank, bKash or Nagad account.</p>}
    {methods.map((method, index) => <fieldset key={method.id} className="admin-panel" disabled={pending} style={{marginBottom: 24, minWidth: 0}}>
      <legend>{index + 1}. {method.label || labels[method.type]}</legend>
      <div className="admin-form-grid">
        <label>Payment type<select value={method.type} onChange={e => update(method.id, {type: e.target.value as PaymentMethod["type"], bankName: "", branch: "", routingNumber: "", accountNumber: ""})}>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Display name<input maxLength={150} value={method.label} onChange={e => update(method.id, {label: e.target.value})}/></label>
        <label>Account holder name<input maxLength={150} required={method.type === "BANK"} value={method.accountName} onChange={e => update(method.id, {accountName: e.target.value})}/></label>
        <label>{method.type === "BANK" ? "Bank account number" : "Receiving mobile / merchant number"}<input inputMode={method.type === "BANK" ? "text" : "numeric"} maxLength={method.type === "BANK" ? 64 : 11} value={method.accountNumber} onChange={e => update(method.id, {accountNumber: e.target.value})}/></label>
        {method.type === "BANK" && <>
          <label>Bank name<input maxLength={150} value={method.bankName} onChange={e => update(method.id, {bankName: e.target.value})}/></label>
          <label>Branch<input maxLength={150} value={method.branch} onChange={e => update(method.id, {branch: e.target.value})}/></label>
          <label>Routing number (optional)<input inputMode="numeric" maxLength={9} value={method.routingNumber} onChange={e => update(method.id, {routingNumber: e.target.value})}/></label>
        </>}
        <label className="span-two">Payment instructions<textarea rows={3} maxLength={1000} value={method.instructions} onChange={e => update(method.id, {instructions: e.target.value})}/></label>
        <label><input type="checkbox" checked={method.enabled} onChange={e => update(method.id, {enabled: e.target.checked})}/> Enabled</label>
      </div>
      <button className="admin-button" onClick={() => {if(window.confirm(`Remove ${method.label}? This takes effect when you save.`)) {setMethods(rows => rows.filter(row => row.id !== method.id)); setDirty(true); setNotice("");}}}>Remove method</button>
    </fieldset>)}
  </section>;
}
