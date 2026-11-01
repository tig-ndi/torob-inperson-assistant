import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../live/ChatApp.tsx';
import {SellerEntry} from '../live/ChecksUI';
import '@fontsource/vazirmatn/arabic-400.css';
import '@fontsource/vazirmatn/arabic-500.css';
import '@fontsource/vazirmatn/arabic-700.css';
import '../prototype/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
const query=new URLSearchParams(location.search),batch=query.get('seller'),token=query.get('token');
createRoot(root).render(<StrictMode>{batch&&token?<SellerEntry batch={batch} token={token}/>:<App />}</StrictMode>);
