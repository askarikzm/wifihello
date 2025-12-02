import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-client';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:9000/api';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Forward query params
    const searchParams = request.nextUrl.searchParams.toString();
    
    const response = await fetch(`${API_BASE}/kyc/admin/list?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    // If KYC module is not enabled or returns error, return empty list
    if (!response.ok) {
      console.warn('KYC module not available or returned error:', response.status);
      return NextResponse.json({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
        moduleEnabled: false,
        message: 'KYC module is not enabled',
      });
    }

    const data = await response.json();
    return NextResponse.json({ ...data, moduleEnabled: true });
  } catch (error) {
    console.error('Admin KYC list fetch error:', error);
    // Return empty list on error to prevent frontend crash
    return NextResponse.json({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
      moduleEnabled: false,
      error: 'Failed to fetch KYC records',
    });
  }
}
