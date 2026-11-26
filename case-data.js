const demoCase = {
  id: 'FL-001',
  company: 'Ofek Studio',
  contact: 'Noya | Recruiting team',
  officialDomain: 'ofek-studio.example',
  date: 'Nov 18, 2026',
  invoice: {
    number: 'EQ-1042',
    purpose: 'Remote work equipment kit',
    original: { time: '10:15', supplier: 'Ofek Office Supplies', amount: 480, account: 'DEMO-2041' },
    revised: { time: '10:27', supplier: 'Ofek Office Supplies', amount: 480, account: 'DEMO-8176' }
  },
  messages: [
    { id: 'intro', body: 'Hi! We saw your resume. We have a remote role open at Ofek Studio.', time: '09:12' },
    { id: 'link', body: 'You can find the job details here.', domain: 'ofek-careers.example', time: '09:13' },
    { id: 'fee', body: 'To hold your spot, please transfer ₪480 by the end of today.', time: '09:14' },
    { id: 'reply', body: 'What is the payment for? Have I already been hired?', time: '10:02', sent: true },
    { id: 'equipment', body: 'It covers your equipment kit. We can start onboarding once you pay.', time: '10:04' },
    { id: 'invoice', body: 'Here is the updated invoice with the payment details.', time: '10:27' }
  ],
  transfers: [
    { id: 'TX-031', label: 'Earlier case A', date: 'Nov 16, 2026', time: '11:10', amount: 420, account: 'DEMO-8176' },
    { id: 'TX-058', label: 'Current case', date: 'Nov 18, 2026', time: '10:42', amount: 480, account: 'DEMO-8176', current: true },
    { id: 'TX-076', label: 'Earlier case B', date: 'Nov 17, 2026', time: '16:25', amount: 520, account: 'DEMO-8176' },
    { id: 'TX-091', label: 'Another transfer', date: 'Nov 18, 2026', time: '12:20', amount: 310, account: 'DEMO-4512' }
  ]
};

const stages = [
  {
    label: 'Message', title: 'Suspicious message', source: 'Chat screenshot', caption: 'Image 01 · First messages',
    intro: 'A recruiter contacts the applicant. Select a finding to highlight it in the chat.',
    next: 'Review the job offer'
  },
  {
    label: 'Job offer', source: 'Follow-up messages', caption: 'Image 02 · Follow-up',
    intro: 'The applicant asks about the payment. The recruiter explains what they need to do before starting.',
    next: 'Compare invoices'
  },
  {
    label: 'Invoices', title: 'Two versions of one invoice', source: 'Supplier documents',
    caption: 'Document 03 · Version comparison',
    intro: 'The applicant received two invoices for the same order. Select a field to compare the values.',
    next: 'Trace the payment'
  },
  {
    label: 'Payment', title: 'Where did the money go?', source: 'Transfer graph',
    caption: 'Document 04 · Fictional transfers',
    intro: 'Open the demo receipt to connect the payment to the account on the invoice.',
    next: 'Open the report'
  },
  {
    label: 'Report', title: 'Case ready for review', source: 'Case timeline',
    caption: 'Report 05 · Evidence summary',
    intro: 'Review the evidence in order, open its sources, and edit or save the summary as a PDF.'
  }
];

const chatFindings = [
  [
    {
      id: 'link', title: 'Different website address',
      detail: 'The address in the message differs from the company’s official address in the demo. Visit the company site directly and look for the role there.'
    },
    {
      id: 'fee', title: 'Urgent payment request',
      detail: 'The recruiter asks for ₪480 on the same day. Pause and verify the request through the company’s official contact details.'
    }
  ],
  [
    {
      id: 'equipment', title: 'Payment before onboarding',
      detail: 'The recruiter says payment for equipment is required before onboarding can begin.'
    },
    {
      id: 'invoice', title: 'Revised invoice',
      detail: 'The recruiter sent a revised invoice. The next step compares it with the original.'
    }
  ]
];
