import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, MapPin, Save, Truck, Wallet } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/Toast';
import PageHeader from '../../components/ui/PageHeader';
import AdminMap from '../../components/map/AdminMap';
import { DetailSkeleton } from '../../components/ui/loaders';
import { ErrorState } from '../../components/ui/states';
import { hasRole, useAuth, CATALOG_ROLES } from '../../context/AuthContext';
import { formatUGX } from '../../utils/format';
import './SettingsPage.css';

/** Mirrors the backend formula (delivery.service calculateDeliveryFee). */
function feeFor(cfg, km) {
  const chargeable = Math.max(0, km - Number(cfg.freeRadiusKm || 0));
  const raw = Number(cfg.baseFeeUgx || 0) + Math.round(chargeable * Number(cfg.perKmRateUgx || 0));
  return Math.max(raw, Number(cfg.minimumFeeUgx || 0));
}

const num = (v) => (v === '' || v == null ? '' : String(v));

/**
 * Store settings the owner controls:
 *  - dispatch point (where riders leave from) chosen on the map
 *  - delivery tariff (base fee, free radius, per-km rate, minimum, max distance)
 *  - commitment deposit rule
 * Distances are road distances computed by the routing service.
 */
export default function SettingsPage() {
  const { role } = useAuth();
  const canEdit = hasRole(role, CATALOG_ROLES);
  const { showToast } = useToast();
  const [delivery, setDelivery] = useState(null);
  const [commitment, setCommitment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [testKm, setTestKm] = useState('8');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/admin/settings');
      const d = res?.data?.delivery || {};
      setDelivery({
        warehouseName: d.warehouseName || '',
        warehouseLat: d.warehouseLat ?? 0.3136,
        warehouseLng: d.warehouseLng ?? 32.5811,
        baseFeeUgx: num(d.baseFeeUgx),
        freeRadiusKm: num(d.freeRadiusKm),
        perKmRateUgx: num(d.perKmRateUgx),
        minimumFeeUgx: num(d.minimumFeeUgx),
        maxDeliveryKm: num(d.maxDeliveryKm),
      });
      const c = res?.data?.commitment || {};
      setCommitment({
        ruleType: c.ruleType === 'FLAT' ? 'FLAT' : 'PERCENTAGE',
        percentageValue: num(c.percentageValue ?? 30),
        flatValueUgx: num(c.flatValueUgx ?? 10000),
        minCommitment: num(c.minCommitment ?? 5000),
      });
    } catch (err) {
      setError(err.message || 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const examples = useMemo(() => (delivery ? [2, 5, 10, 20, 40].map((km) => ({ km, fee: feeFor(delivery, km) })) : []), [delivery]);

  // Stable picker so typing elsewhere does not re-center the map.
  const lat = delivery?.warehouseLat;
  const lng = delivery?.warehouseLng;
  const picker = useMemo(
    () => ({
      value: { lat: Number(lat), lng: Number(lng) },
      onChange: canEdit
        ? (p) => setDelivery((d) => ({ ...d, warehouseLat: Math.round(p.lat * 1e6) / 1e6, warehouseLng: Math.round(p.lng * 1e6) / 1e6 }))
        : undefined,
    }),
    [lat, lng, canEdit],
  );

  const saveDelivery = async (e) => {
    e.preventDefault();
    setSavingDelivery(true);
    try {
      await api.put('/admin/settings/delivery', {
        warehouseName: delivery.warehouseName.trim(),
        warehouseLat: Number(delivery.warehouseLat),
        warehouseLng: Number(delivery.warehouseLng),
        baseFeeUgx: Math.round(Number(delivery.baseFeeUgx || 0)),
        freeRadiusKm: Number(delivery.freeRadiusKm || 0),
        perKmRateUgx: Math.round(Number(delivery.perKmRateUgx || 0)),
        minimumFeeUgx: Math.round(Number(delivery.minimumFeeUgx || 0)),
        maxDeliveryKm: delivery.maxDeliveryKm === '' ? null : Number(delivery.maxDeliveryKm),
      });
      showToast('Delivery settings saved. New orders use the updated tariff.', { type: 'success' });
    } catch (err) {
      showToast(err.message || 'Could not save delivery settings.', { type: 'error' });
    } finally {
      setSavingDelivery(false);
    }
  };

  const saveDeposit = async (e) => {
    e.preventDefault();
    setSavingDeposit(true);
    try {
      await api.put('/admin/settings/commitment', {
        ruleType: commitment.ruleType,
        percentageValue: Number(commitment.percentageValue || 0),
        flatValueUgx: Math.round(Number(commitment.flatValueUgx || 0)),
        minCommitment: Math.round(Number(commitment.minCommitment || 0)),
      });
      showToast('Deposit rule saved.', { type: 'success' });
    } catch (err) {
      showToast(err.message || 'Could not save the deposit rule.', { type: 'error' });
    } finally {
      setSavingDeposit(false);
    }
  };

  if (loading) return <DetailSkeleton />;
  if (error || !delivery) return <ErrorState message={error || 'Settings unavailable.'} onRetry={load} />;

  const set = (field) => (e) => setDelivery({ ...delivery, [field]: e.target.value });
  const ro = !canEdit || savingDelivery;

  return (
    <div>
      <PageHeader
        title="Store settings"
        description={canEdit ? 'Control where deliveries leave from, how delivery is priced and the deposit customers pay.' : 'Read-only: only admins can change store settings.'}
      />

      <form className="settings-grid" onSubmit={saveDelivery}>
        <section className="panel panel-pad">
          <h3 className="settings-title">
            <MapPin size={16} aria-hidden="true" /> Dispatch point
          </h3>
          <p className="field-hint">Where riders and technicians leave from. Click the map or drag the pin. Delivery distances and fees are calculated by road from here.</p>
          <AdminMap height={320} picker={picker} />
          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-field">
              <label htmlFor="st-name">Name shown to staff</label>
              <input id="st-name" value={delivery.warehouseName} onChange={set('warehouseName')} placeholder="e.g. Nakasero warehouse, Kampala" disabled={ro} />
            </div>
            <div className="form-field">
              <label>Coordinates</label>
              <input value={`${delivery.warehouseLat}, ${delivery.warehouseLng}`} readOnly className="mono" />
            </div>
          </div>
        </section>

        <section className="panel panel-pad">
          <h3 className="settings-title">
            <Truck size={16} aria-hidden="true" /> Delivery tariff
          </h3>
          <p className="field-hint">Fee = base fee + (road km − free radius) × rate per km, never below the minimum.</p>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="st-base">Base fee (UGX)</label>
              <input id="st-base" type="number" min="0" value={delivery.baseFeeUgx} onChange={set('baseFeeUgx')} disabled={ro} />
            </div>
            <div className="form-field">
              <label htmlFor="st-free">Free radius (km)</label>
              <input id="st-free" type="number" min="0" step="0.5" value={delivery.freeRadiusKm} onChange={set('freeRadiusKm')} disabled={ro} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="st-rate">Rate per km (UGX)</label>
              <input id="st-rate" type="number" min="0" value={delivery.perKmRateUgx} onChange={set('perKmRateUgx')} disabled={ro} />
            </div>
            <div className="form-field">
              <label htmlFor="st-min">Minimum fee (UGX)</label>
              <input id="st-min" type="number" min="0" value={delivery.minimumFeeUgx} onChange={set('minimumFeeUgx')} disabled={ro} />
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="st-max">Maximum delivery distance (km)</label>
            <input id="st-max" type="number" min="1" value={delivery.maxDeliveryKm} onChange={set('maxDeliveryKm')} placeholder="No limit" disabled={ro} />
            <span className="field-hint">Orders farther than this road distance are refused at checkout. Leave empty to deliver anywhere in Uganda.</span>
          </div>

          <div className="fee-calc">
            <h4>
              <Calculator size={14} aria-hidden="true" /> Fee calculator
            </h4>
            <div className="fee-calc__try">
              <input type="number" min="0" step="0.5" value={testKm} onChange={(e) => setTestKm(e.target.value)} aria-label="Distance in km" /> km →
              <strong>{formatUGX(feeFor(delivery, Number(testKm) || 0))}</strong>
              {delivery.maxDeliveryKm !== '' && Number(testKm) > Number(delivery.maxDeliveryKm) && <span className="badge badge--danger">Beyond limit</span>}
            </div>
            <table className="fee-calc__table">
              <tbody>
                {examples.map((ex) => (
                  <tr key={ex.km}>
                    <td>{ex.km} km</td>
                    <td>{formatUGX(ex.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <button type="submit" className="btn btn--primary" disabled={savingDelivery}>
              <Save size={14} aria-hidden="true" /> {savingDelivery ? 'Saving…' : 'Save delivery settings'}
            </button>
          )}
        </section>
      </form>

      <form className="panel panel-pad settings-deposit" onSubmit={saveDeposit}>
        <h3 className="settings-title">
          <Wallet size={16} aria-hidden="true" /> Deposit (commitment) rule
        </h3>
        <p className="field-hint">Customers pay this deposit with MTN MoMo or Airtel Money to confirm an order, and the balance after delivery.</p>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="st-rule">Rule</label>
            <select id="st-rule" value={commitment.ruleType} onChange={(e) => setCommitment({ ...commitment, ruleType: e.target.value })} disabled={!canEdit}>
              <option value="PERCENTAGE">Percentage of order total</option>
              <option value="FLAT">Fixed amount</option>
            </select>
          </div>
          {commitment.ruleType === 'PERCENTAGE' ? (
            <div className="form-field">
              <label htmlFor="st-pct">Percentage (%)</label>
              <input id="st-pct" type="number" min="0" max="100" value={commitment.percentageValue} onChange={(e) => setCommitment({ ...commitment, percentageValue: e.target.value })} disabled={!canEdit} />
            </div>
          ) : (
            <div className="form-field">
              <label htmlFor="st-flat">Fixed deposit (UGX)</label>
              <input id="st-flat" type="number" min="0" value={commitment.flatValueUgx} onChange={(e) => setCommitment({ ...commitment, flatValueUgx: e.target.value })} disabled={!canEdit} />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="st-mindep">Minimum deposit (UGX)</label>
            <input id="st-mindep" type="number" min="0" value={commitment.minCommitment} onChange={(e) => setCommitment({ ...commitment, minCommitment: e.target.value })} disabled={!canEdit} />
          </div>
        </div>
        {canEdit && (
          <button type="submit" className="btn btn--primary" disabled={savingDeposit}>
            <Save size={14} aria-hidden="true" /> {savingDeposit ? 'Saving…' : 'Save deposit rule'}
          </button>
        )}
      </form>
    </div>
  );
}
