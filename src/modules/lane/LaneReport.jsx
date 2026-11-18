import React, { useState } from 'react';
import Report5LaneCa1 from '../../components/Report5LaneCa1.jsx';
import LaneDeliveryView from './LaneDeliveryView.jsx';

const VIEWS = [
  { id: 'delivery', label: '1st Deli & ODR' },
  { id: 'ca1', label: '% Ca 1' }
];

// Tab "Lane" (KAS-314): gom mọi chỉ số theo lane. Id module vẫn là `report5` để không
// vỡ URL, trạng thái đã lưu, snapshot và chat.
export default function LaneReport(props) {
  const [view, setView] = useState('delivery');
  return (
    <div>
      <div role="tablist" aria-label="Chỉ số theo lane" style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem' }}>
        {VIEWS.map(v => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id}
            className={view === v.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>
      {view === 'ca1' ? <Report5LaneCa1 {...props} /> : <LaneDeliveryView density={props.density} selectedHubTypes={props.selectedHubTypes} />}
    </div>
  );
}
