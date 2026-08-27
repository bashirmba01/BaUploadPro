// Pehle import mein yeh add karo:
import { hasRole } from '$lib/auth';
import { useEffect, useState } from 'react';

// Phir component ke andar:
const [isAdmin, setIsAdmin] = useState(false);

useEffect(() => {
  hasRole('admin').then(setIsAdmin);
}, []);

// Phir Sidebar links mein "Transfer Manager" ke neeche yeh add karo:
{isAdmin && (
  <SidebarLink to="/app/admin/topups" icon={IconCash}>
    Admin · Topups
  </SidebarLink>
)}