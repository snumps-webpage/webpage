<script lang="ts">
	import { enhance } from '$app/forms';
	import type { AttendanceRecord } from '$lib/types';
    import Skeleton from '$lib/components/Skeleton.svelte';

	let { data } = $props();
    
    interface Application {
        id: string;
        name: string;
        email: string;
        phone: string;
        department: string;
        background: string;
        submittedAt: string;
        accepted: boolean;
        processing?: boolean;
    }

    interface SeminarRequest {
        id: string;
        title: string;
        speakerNames: string[];
        submittedAt: string;
        status: string;
    }

    interface Event {
        id: string;
        title: string;
        date: string;
        type: string;
        status: string;
        pathId?: string;
        attendCode?: string;
    }

    // State for applications to allow partial updates
    let applications = $state<Application[]>([]);
    let seminarRequests = $state<SeminarRequest[]>([]);
    let events = $state<Event[]>([]);
    let attendanceQueue = $state<AttendanceRecord[]>([]);

    let loadingApps = $state(true);
    let loadingSeminars = $state(true);
    let loadingEvents = $state(true);
    let loadingQueue = $state(true);

    let refreshingApps = $state(false);
    let refreshingSeminars = $state(false);

    // Resolve streamed data
    $effect(() => {
        data.applications.then(val => {
            applications = (val as Application[]).map((app) => ({ ...app, processing: false }));
            loadingApps = false;
        });
        data.seminarRequests.then(val => {
            seminarRequests = val as SeminarRequest[];
            loadingSeminars = false;
        });
        data.events.then(val => {
            events = val as Event[];
            loadingEvents = false;
        });
        data.attendanceQueue.then(val => {
            attendanceQueue = val;
            loadingQueue = false;
        });
    });

    // Clamp indices if data length changes
    $effect(() => {
        if (applications.length > 0 && appStartIndex > 0 && appStartIndex + 3 > applications.length) {
            appStartIndex = Math.max(0, applications.length - 3);
        }
        if (seminarRequests.length > 0 && seminarPage > totalSeminarPages && totalSeminarPages > 0) {
            seminarPage = totalSeminarPages;
        }
    });

    async function refreshApplications() {
        refreshingApps = true;
        try {
            const res = await fetch('/api/admin/applications');
            if (res.ok) {
                const newApps = await res.json();
                applications = newApps.map((app: Application) => ({ ...app, processing: false }));
                appStartIndex = 0; // Reset carousel to start on refresh
            }
        } catch (e) {
            console.error(e);
        } finally {
            refreshingApps = false;
        }
    }

    async function refreshSeminars() {
        refreshingSeminars = true;
        try {
            const res = await fetch('/api/admin/seminar-requests');
            if (res.ok) {
                seminarRequests = await res.json();
                seminarPage = 1; // Reset pagination to first page
            }
        } catch (e) {
            console.error(e);
        } finally {
            refreshingSeminars = false;
        }
    }

    // Carousel state for applications
    let appStartIndex = $state(0);

    function nextApp() {
        if (appStartIndex + 3 < applications.length) {
            appStartIndex++;
        }
    }

    function prevApp() {
        if (appStartIndex > 0) {
            appStartIndex--;
        }
    }

    // Pagination for seminar requests
    let seminarPage = $state(1);
    const seminarLimit = 5;
    let totalSeminarPages = $derived(Math.ceil(seminarRequests.length / seminarLimit));
    let paginatedSeminars = $derived(
        seminarRequests.slice((seminarPage - 1) * seminarLimit, seminarPage * seminarLimit)
    );

    // State for editing attendance
    let editingRecord = $state<AttendanceRecord | null>(null);
    let editDialog: HTMLDialogElement;
    
        function openEdit(record: AttendanceRecord) {
            editingRecord = record;
            editDialog.showModal();
        }
    
        function closeEdit() {
            editDialog.close();
            editingRecord = null;
        }
        
        /**
         * Converts an ISO string to a format compatible with <input type="datetime-local">.
         * datetime-local expects YYYY-MM-DDTHH:MM in local time.
         */
        function toDateTimeLocal(iso?: string) {
            if (!iso) return '';
            const d = new Date(iso);
            return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        }
    </script>
    
    <div class="admin-container">
    	<header>
    		<h1>관리자 대시보드</h1>
    		<div class="header-actions">
    			<a href="/admin/events/new" class="admin-action-btn">📅 새 이벤트 만들기</a>
    			<a href="/admin/events/connect" class="admin-action-btn secondary">🔗 기존 이벤트 연결</a>
    			<a href="/signup" class="admin-action-btn signup">📝 회원 가입 페이지</a>
    		</div>
    	</header>
    
    		<section class="events-section">
    			<h2>이벤트 관리</h2>
    			{#if loadingEvents}
    	            <div class="skeleton-list">
    	                <Skeleton height="3rem" className="mb-2" />
    	                <Skeleton height="3rem" className="mb-2" />
    	                <Skeleton height="3rem" />
    	            </div>
    	        {:else if events.length === 0}
    				<p class="empty">생성된 이벤트가 없습니다.</p>
    			{:else}
    				<div class="table-container">
    					<table>
    						<thead>
    							<tr>
    								<th>제목</th>
    								<th>일시</th>
    								<th>종류</th>
    								<th>상태</th>
    								<th>링크</th>
    								<th>관리</th>
    							</tr>
    						</thead>
    						<tbody>
    							{#each events as event (event.id)}
    								<tr class={event.status}>
    									<td>{event.title}</td>
    									<td>{event.date}</td>
    									<td><span class="tag">{event.type}</span></td>
    									<td><span class="status-badge {event.status}">{event.status.toUpperCase()}</span></td>
    									<td>
    										{#if event.status !== 'draft'}
    											<div class="links">
    												<button class="copy-btn" onclick={() => navigator.clipboard.writeText(`${window.location.origin}/events/${event.pathId}/${event.attendCode}`)}>Copy Link 📋</button>
    											</div>
    										{:else}
    											<span class="hint">Not Published</span>
    										{/if}
    									</td>
    									<td class="actions-cell">
    										{#if event.status === 'draft' || event.status === 'expired'}
    											<form method="POST" action="?/activateEvent" use:enhance>
    												<input type="hidden" name="id" value={event.id} />
    												<button class="btn activate small">Activate</button>
    											</form>
    										{:else if event.status === 'active'}
    											<form method="POST" action="?/expireEvent" use:enhance>
    												<input type="hidden" name="id" value={event.id} />
    												<button class="btn expire small">Expire</button>
    											</form>
    										{/if}
    										<form method="POST" action="?/deleteEvent" use:enhance onsubmit={() => confirm('정말 삭제하시겠습니까?')}>
    											<input type="hidden" name="id" value={event.id} />
    											<button class="btn delete small">Delete</button>
    										</form>
    									</td>
    								</tr>
    							{/each}
    						</tbody>
    					</table>
    				</div>
    			{/if}
    		</section>
    	    		<section class="mt-4">
    	    			<h2>출석 승인 대기 ({attendanceQueue.length})</h2>
    	    			{#if loadingQueue}
    	    	            <div class="skeleton-list">
    	    	                <Skeleton height="3rem" className="mb-2" />
    	    	                <Skeleton height="3rem" />
    	    	            </div>
    	    	        {:else if attendanceQueue.length === 0}
    	    				<p class="empty">대기 중인 출석 요청이 없습니다.</p>
    	    			{:else}
    	    				<div class="table-container">
    	    					<table>
    	    						<thead>
    	    							<tr>
    	    								<th>이름</th>
    	    								<th>학과</th>
    	    								<th>이벤트</th>
    	    								<th>시작 시간</th>
    	    								<th>종료 시간</th>
    	    								<th>관리</th>
    	    							</tr>
    	    						</thead>
    	    						<tbody>
    	    							{#each attendanceQueue as record (record.id)}
    	    								{@const event = events.find(e => e.id === record.eventId)}
    	    								<tr>
    	    									<td>{record.userName}</td>
    	    									<td>{record.userDept}</td>
    	    									<td>{event?.title ?? 'Unknown'}</td>
    	    									<td>{new Date(record.startTime).toLocaleTimeString()}</td>
    	    									<td>{record.endTime ? new Date(record.endTime).toLocaleTimeString() : '-'}</td>
    	    									<td class="actions-cell">
    	    										<form method="POST" action="?/approveAttendance" use:enhance>
    	    											<input type="hidden" name="id" value={record.id} />
    	    											<input type="hidden" name="eventId" value={record.eventId} />
    	    											<input type="hidden" name="userEmail" value={record.userEmail} />
    	    											<button class="btn approve small">승인</button>
    	    										</form>
    	    										<form method="POST" action="?/rejectAttendance" use:enhance>
    	    											<input type="hidden" name="id" value={record.id} />
    	    											<button class="btn reject small">거절</button>
    	    										</form>
    	    	                                    <button class="btn edit small" onclick={() => openEdit(record)}>수정</button>
    	    	                                    <form method="POST" action="?/deleteAttendanceRecord" use:enhance onsubmit={() => confirm('정말 삭제하시겠습니까?')}>
    	    	                                        <input type="hidden" name="id" value={record.id} />
    	    	                                        <button class="btn delete small">삭제</button>
    	    	                                    </form>
    	    									</td>
    	    								</tr>
    	    							{/each}
    	    						</tbody>
    	    					</table>
    	    				</div>
    	    			{/if}
    	    		</section>
    	    	        <!-- Edit Dialog -->
        <dialog bind:this={editDialog} class="edit-dialog">
            {#if editingRecord}
                <h3>출석 기록 수정</h3>
                <p><strong>{editingRecord.userName}</strong> ({editingRecord.userEmail})</p>
                
                <form method="POST" action="?/updateAttendanceTime" use:enhance={() => {
                    return ({ result }) => {
                        if (result.type === 'success') closeEdit();
                    };
                }}>
                    <input type="hidden" name="id" value={editingRecord.id} />
                    
                    <div class="field">
                        <label for="startTime">시작 시간</label>
                        <input type="datetime-local" id="startTime" name="startTime" value={toDateTimeLocal(editingRecord.startTime)} required />
                    </div>
                    
                    <div class="field">
                        <label for="endTime">종료 시간</label>
                        <input type="datetime-local" id="endTime" name="endTime" value={toDateTimeLocal(editingRecord.endTime)} />
                    </div>
    
                    <div class="dialog-actions">
                        <button type="button" class="btn cancel" onclick={closeEdit}>취소</button>
                        <button class="btn submit">저장</button>
                    </div>
                </form>
            {/if}
        </dialog>
    
    				<section class="mt-4">
    
    					<div class="section-header">
    
    			            <h2>세미나 개설 신청 ({seminarRequests.length})</h2>
    
    			            <button 
    
    			                class="refresh-btn" 
    
    			                onclick={refreshSeminars} 
    
    			                disabled={refreshingSeminars || loadingSeminars}
    
    			                aria-label="Refresh seminars"
    
    			            >
    
    			                <span class="refresh-icon" class:spinning={refreshingSeminars}>🔄</span>
    
    			            </button>
    
    			        </div>
    
    					
    
    					{#if loadingSeminars}
    
    			            <div class="skeleton-list">
    
    			                <Skeleton height="3rem" className="mb-2" />
    
    			                <Skeleton height="3rem" className="mb-2" />
    
    			                <Skeleton height="3rem" />
    
    			            </div>
    
    			        {:else if seminarRequests.length === 0}
    
    						<p class="empty">대기 중인 세미나 신청이 없습니다.</p>
    
    					{:else}
    
    						<div class="table-container">
    
    							<table>
    
    								<thead>
    
    									<tr>
    
    										<th>주제</th>
    
    										<th>발표자</th>
    
    										<th>신청일</th>
    
    										<th>관리</th>
    
    									</tr>
    
    								</thead>
    
    								<tbody>
    
    									{#each paginatedSeminars as req (req.id)}
    
    										<tr>
    
    											<td>{req.title}</td>
    
    											<td>
    
    												{#if req.speakerNames && req.speakerNames.length > 0}
    
    													{req.speakerNames.join(', ')}
    
    												{:else}
    
    													<span class="hint">미지정</span>
    
    												{/if}
    
    											</td>
    
    											<td>{new Date(req.submittedAt).toLocaleDateString()}</td>
    
    											<td class="actions-cell">
    
    												<form method="POST" action="?/approveSeminar" use:enhance={() => {
    
    													return ({ result, update }) => {
    
    														if (result.type === 'success') alert('세미나가 승인되었습니다.');
    
    														update();
    
    													};
    
    												}} onsubmit={() => confirm(`'${req.title}' 세미나 개설을 승인하시겠습니까?`)}>
    
    													<input type="hidden" name="id" value={req.id} />
    
    													<button class="btn approve small">승인</button>
    
    												</form>
    
    												<form method="POST" action="?/rejectSeminar" use:enhance={() => {
    
    													return ({ result, update }) => {
    
    														if (result.type === 'success') alert('신청이 반려/삭제되었습니다.');
    
    														update();
    
    													};
    
    												}} onsubmit={() => confirm('반려하시겠습니까?')}>
    
    													<input type="hidden" name="id" value={req.id} />
    
    													<button class="btn reject small">반려</button>
    
    												</form>
    
    											</td>
    
    										</tr>
    
    									{/each}
    
    								</tbody>
    
    							</table>
    
    						</div>
    
    			
    
    			            {#if totalSeminarPages > 1}
    
    			                <div class="pagination">
    
    			                    <button 
    
    			                        class="page-btn" 
    
    			                        disabled={seminarPage === 1} 
    
    			                        onclick={() => seminarPage--}
    
    			                    >
    
    			                        이전
    
    			                    </button>
    
    			                    
    
    			                    {#each Array.from({ length: totalSeminarPages }).map((_, i) => i) as i (i)}
    
    			                        <button 
    
    			                            class:active={seminarPage === i + 1} 
    
    			                            onclick={() => seminarPage = i + 1}
    
    			                            class="page-btn"
    
    			                        >
    
    			                            {i + 1}
    
    			                        </button>
    
    			                    {/each}
    
    			
    
    			                    <button 
    
    			                        class="page-btn" 
    
    			                        disabled={seminarPage === totalSeminarPages} 
    
    			                        onclick={() => seminarPage++}
    
    			                    >
    
    			                        다음
    
    			                    </button>
    
    			                </div>
    
    			            {/if}
    
    					{/if}
    
    				</section>
    
    			
    	    		    		<section class="mt-4">
    
    			
    	    		    
    
    			
    	    		    			<div class="section-header">
    
    			
    	    		                    <h2>가입 승인 대기 ({applications.length})</h2>
    
    			
    	    		                    <button 
    
    			
    	    		                        class="refresh-btn" 
    
    			
    	    		                        onclick={refreshApplications} 
    
    			
    	    		                        disabled={refreshingApps || loadingApps}
    
    			
    	    		                        aria-label="Refresh applications"
    
    			
    	    		                    >
    
    			
    	    		                        <span class="refresh-icon" class:spinning={refreshingApps}>🔄</span>
    
    			
    	    		                    </button>
    
    			
    	    		                </div>
    
    			
    	    		    
    
    			
    	    		    			
    
    			
    	    		    
    
    			
    	    		    			{#if loadingApps}
    
    			
    	    		                    <div class="carousel-container skeleton-carousel">
    
    			
    	    		                        <div class="carousel-viewport">
    
    			
    	    		                            <div class="carousel-track">
    
    			
    	    		                                <div class="carousel-card-wrapper"><Skeleton height="350px" borderRadius="12px" /></div>
    
    			
    	    		                                <div class="carousel-card-wrapper"><Skeleton height="350px" borderRadius="12px" /></div>
    
    			
    	    		                                <div class="carousel-card-wrapper"><Skeleton height="350px" borderRadius="12px" /></div>
    
    			
    	    		                            </div>
    
    			
    	    		                        </div>
    
    			
    	    		                    </div>
    
    			
    	    		                {:else if applications.length === 0}
    
    			
    	    		    
    
    			
    	    		    				<p class="empty">대기 중인 가입 신청이 없습니다.</p>
    
    			
    	    		    
    
    			
    	    		    			{:else}
    
    			
    	    		                    <div class="carousel-container">
    
    			
    	    		                        <button 
    
    			
    	    		                            class="carousel-nav prev" 
    
    			
    	    		                            onclick={prevApp} 
    
    			
    	    		                            disabled={appStartIndex === 0}
    
    			
    	    		                            aria-label="Previous application"
    
    			
    	    		                        >
    
    			
    	    		                            &lt;
    
    			
    	    		                        </button>
    
    			
    	    		
    
    			
    	    		                        <div class="carousel-viewport">
    
    			
    	    		                            <div class="carousel-track" style="transform: translateX(-{appStartIndex * (100 / 3)}%);">
    
    			
    	    		                                {#each applications as app (app.id)}
    
    			
    	    		                                    <div class="carousel-card-wrapper">
    
    			
    	    		                                        <div class="card carousel-card" class:accepted={app.accepted}>
    
    			
    	    		                                            <div class="card-header">
    
    			
    	    		                                                <h3>{app.name}</h3>	
    
    			
    	    		                                                <span class="dept">{app.department}</span>
    
    			
    	    		                                            </div>
    
    			
    	    		                                            
    
    			
    	    		                                                                                        <div class="info">
    
    			
    	    		                                            
    
    			
    	    		                                                                                            <p><strong>신청일:</strong> {new Date(app.submittedAt).toLocaleDateString()}</p>
    
    			
    	    		                                            
    
    			
    	    		                                                                                        </div>
    
    			
    	    		                                            
    
    			
    	    		                                            
    
    			
    	    		                                            
    
    			
    	    		                                                                                        <details>
    
    			
    	    		                                            
    
    			
    	    		                                                                                            <summary>상세 정보 보기</summary>
    
    			
    	    		                                            
    
    			
    	    		                                                                                            <div class="details-content">
    
    			
    	    		                                            
    
    			
    	    		                                                                                                <p><strong>이메일:</strong> {app.email}</p>
    
    			
    	    		                                            
    
    			
    	    		                                                                                                <p><strong>전화번호:</strong> {app.phone}</p>
    
    			
    	    		                                            
    
    			
    	    		                                                                                                <p><strong>배경지식:</strong><br>{app.background || '-'}</p>
    
    			
    	    		                                            
    
    			
    	    		                                                                                            </div>
    
    			
    	    		                                            
    
    			
    	    		                                                                                        </details>
    
    			
    	    		
    
    			
    	    		                                            <div class="actions">
    
    			
    	    		                                                {#if app.accepted}
    
    			
    	    		                                                    <button class="btn approved-badge" disabled>승인됨</button>
    
    			
    	    		                                                {:else}
    
    			
    	    		                                                    <form method="POST" action="?/approve" use:enhance={({ formData }) => {
    
    			
    	    		                                                        // Instant deactivation
    
    			
    	    		                                                        const id = formData.get('id');
    
    			
    	    		                                                        const idx = applications.findIndex(a => a.id === id);
    
    			
    	    		                                                        if (idx !== -1) applications[idx].processing = true;
    
    			
    	    		
    
    			
    	    		                                                        return async ({ result }) => {
    
    			
    	    		                                                            if (result.type === 'success') {
    
    			
    	    		                                                                alert('회원 가입이 승인되었습니다.');
    
    			
    	    		                                                                if (idx !== -1) {
    
    			
    	    		                                                                    applications[idx].accepted = true;
    
    			
    	    		                                                                    applications[idx].processing = false;
    
    			
    	    		                                                                }
    
    			
    	    		                                                            } else {
    
    			
    	    		                                                                if (idx !== -1) applications[idx].processing = false;
    
    			
    	    		                                                            }
    
    			
    	    		                                                        };
    
    			
    	    		                                                    }}>
    
    			
    	    		                                                        <input type="hidden" name="id" value={app.id} />
    
    			
    	    		                                                        <button class="btn approve" disabled={app.processing}>승인</button>
    
    			
    	    		                                                    </form>
    
    			
    	    		                                                {/if}
    
    			
    	    		
    
    			
    	    		                                                <form method="POST" action="?/reject" use:enhance={({ formData }) => {
    
    			
    	    		                                                    const id = formData.get('id');
    
    			
    	    		                                                    const idx = applications.findIndex(a => a.id === id);
    
    			
    	    		                                                    if (idx !== -1) applications[idx].processing = true;
    
    			
    	    		
    
    			
    	    		                                                    return async ({ result, update }) => {
    
    			
    	    		                                                        if (result.type === 'failure' || result.type === 'error') {
    
    			
    	    		                                                            if (idx !== -1) applications[idx].processing = false;
    
    			
    	    		                                                        }
    
    			
    	    		                                                        update();
    
    			
    	    		                                                    };
    
    			
    	    		                                                }} onsubmit={() => confirm(app.accepted ? '신청 내역을 삭제하시겠습니까?' : '정말 거절하시겠습니까? 신청 내역이 영구적으로 삭제됩니다.')}>
    
    			
    	    		                                                    <input type="hidden" name="id" value={app.id} />
    
    			
    	    		                                                    <button class="btn reject" disabled={app.processing}>{app.accepted ? '삭제' : '거절'}</button>
    
    			
    	    		                                                </form>
    
    			
    	    		                                            </div>
    
    			
    	    		                                        </div>
    
    			
    	    		                                    </div>
    
    			
    	    		                                {/each}
    
    			
    	    		                            </div>
    
    			
    	    		                        </div>
    
    			
    	    		
    
    			
    	    		                        <button 
    
    			
    	    		                            class="carousel-nav next" 
    
    			
    	    		                            onclick={nextApp} 
    
    			
    	    		                            disabled={appStartIndex + 3 >= applications.length}
    
    			
    	    		                            aria-label="Next application"
    
    			
    	    		                        >
    
    			
    	    		                            &gt;
    
    			
    	    		                        </button>
    
    			
    	    		                    </div>
    
    			
    	    		    			{/if}
    
    			
    	    		
    
    				</section>
    
    			</div>

<style>
	.mt-4 {
		margin-top: 4rem;
	}
	
	.admin-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		border-bottom: 2px solid var(--border-color);
		padding-bottom: 1rem;
	}

	h1 { 
		margin: 0; 
		color: var(--text-primary);
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
		font-weight: 700;
	}

	.home-link {
		color: var(--text-secondary);
		text-decoration: none;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.admin-action-btn {
		background: var(--text-primary);
		color: var(--bg-primary);
		padding: 0.6rem 1rem;
		border-radius: 4px;
		text-decoration: none;
		font-weight: 700;
		font-size: 0.9rem;
		user-select: none;
		font-family: "Inter", "Noto Sans KR", sans-serif;
		transition: opacity 0.2s;
	}

	.admin-action-btn:hover { opacity: 0.9; }
	.admin-action-btn.secondary { background: var(--text-secondary); }
	.admin-action-btn.signup { background: var(--color-success-text); }

	.status-badge {
		display: inline-block;
		padding: 0.2rem 0.6rem;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		white-space: nowrap;
		width: max-content;
		user-select: none;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.status-badge.draft { background: var(--btn-secondary); color: var(--text-secondary); }
	.status-badge.active { background: var(--color-success-bg); color: var(--color-success-text); }
	.status-badge.expired { background: var(--color-danger-bg); color: var(--color-danger-text); }

	.links { display: flex; gap: 0.5rem; flex-direction: column; }
	.copy-btn {
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		padding: 0.3rem 0.6rem;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
		user-select: none;
		color: var(--text-primary);
	}
	.copy-btn:hover { background: var(--btn-secondary); }
	.hint { color: var(--text-secondary); font-size: 0.8rem; font-style: italic; }

    .copy-link-btn {
        background: none;
        border: none;
        padding: 0;
        color: var(--text-primary);
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        font-size: inherit;
    }

    .copy-link-btn:hover { color: var(--text-secondary); }

	.activate { background: var(--color-success-text); color: white; }
	.expire { background: var(--color-warning-text); color: white; }
	.delete { background: var(--text-secondary); color: white; }
    .edit { background: var(--text-primary); color: white; }

	.empty {
		color: var(--text-secondary);
		text-align: center;
		padding: 3rem;
		background: var(--bg-secondary);
		border-radius: 8px;
		border: 1px solid var(--border-color);
		user-select: none;
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
		font-style: italic;
	}

    .edit-dialog {
        padding: 2rem;
        border-radius: 8px;
        border: 1px solid var(--border-color);
        box-shadow: var(--shadow);
        min-width: 300px;
        background: var(--bg-secondary);
        color: var(--text-primary);
    }
    
    .edit-dialog::backdrop {
        background: rgba(0,0,0,0.5);
    }
    
    .edit-dialog h3 { 
		margin-top: 0; 
		color: var(--text-primary); 
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
	}
    
    .edit-dialog .field { margin-bottom: 1rem; }
    
    .edit-dialog label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
    }
    
    .edit-dialog input {
        width: 100%;
        padding: 0.6rem;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-primary);
        color: var(--text-primary);
    }
    
    .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 1.5rem;
    }
    
    .dialog-actions .btn {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        user-select: none;
    }
    
    .dialog-actions .submit { background: var(--color-success-text); color: white; }
    .dialog-actions .cancel { background: var(--text-secondary); color: white; }

    /* Search Bar */
	.search-bar {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		align-items: center;
	}

	.search-input-wrapper {
		flex: 1;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-size: 0.95rem;
        background: var(--bg-primary);
        color: var(--text-primary);
	}

	.toggle-group {
		display: flex;
		background: var(--btn-secondary);
		padding: 0.25rem;
		border-radius: 4px;
		border: 1px solid var(--border-color);
		user-select: none;
	}

	.toggle-btn {
		padding: 0.4rem 1rem;
		border: none;
		background: transparent;
		border-radius: 4px;
		font-size: 0.875rem;
		cursor: pointer;
		color: var(--text-secondary);
		transition: all 0.2s;
		user-select: none;
		font-weight: 600;
	}

	.toggle-btn.active {
		background: var(--bg-primary);
		color: var(--text-primary);
		box-shadow: 0 1px 2px rgba(0,0,0,0.1);
	}

    .search-empty {
        text-align: center;
        color: var(--text-secondary);
        padding: 2rem;
        font-size: 0.9rem;
    }

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px; /* Sharper */
		padding: 1.5rem;
		box-shadow: var(--shadow);
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.card:hover {
		transform: translateY(-2px);
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
	}

	.card-header h3 { 
		margin: 0; 
		font-size: 1.1rem; 
		color: var(--text-primary); 
		font-family: "Playfair Display", "Nanum Myeongjo", serif;
	}
	.dept { 
		font-size: 0.75rem; 
		color: var(--text-primary); 
		background: var(--btn-secondary);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		user-select: none;
		font-weight: 700;
		text-transform: uppercase;
	}

	.info p {
		margin: 0.5rem 0;
		font-size: 0.9rem;
		color: var(--text-primary);
		font-family: "Inter", "Noto Sans KR", sans-serif;
	}
	.info p:has(strong) { font-family: var(--font-mono); font-size: 0.85rem; }

	details {
		margin: 1rem 0;
		font-size: 0.9rem;
		color: var(--text-primary);
	}
	
	summary {
		cursor: pointer;
		color: var(--text-primary);
		font-weight: 600;
		user-select: none;
		text-decoration: underline;
	}

	.details-content {
		margin-top: 0.5rem;
		padding: 0.75rem;
		background: var(--bg-primary);
		border-radius: 4px;
		color: var(--text-primary);
		white-space: pre-wrap;
		border: 1px solid var(--border-color);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}

	.btn {
		flex: 1;
		padding: 0.5rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 600;
		transition: opacity 0.2s;
		user-select: none;
	}

	.btn:hover { opacity: 0.9; }

	.approve {
		background: var(--color-success-text);
		color: white;
	}

	.reject {
		background: var(--color-danger-text);
		color: white;
	}

	.approved-badge {
		background: var(--color-success-bg);
		color: var(--color-success-text);
		cursor: default !important;
	}

	.card.accepted {
		opacity: 0.6;
		border-style: dashed;
		background: var(--bg-primary);
	}

	.small {
		padding: 0.3rem 0.6rem;
		font-size: 0.8rem;
		width: auto;
	}

	.table-container {
		background: var(--bg-secondary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
	}

	th, td {
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--text-primary);
	}

	td { font-family: "Inter", "Noto Sans KR", sans-serif; }
	
	/* Monospace for data-heavy columns */
	td:nth-child(2), /* Date/Time */
	td:nth-child(5), /* Links/Codes */
	.links, .hint { 
		font-family: var(--font-mono); 
		font-size: 0.85rem; 
	}

	th {
		background: var(--bg-primary);
		font-weight: 700;
		color: var(--text-primary);
		text-transform: uppercase;
		font-size: 0.8rem;
		letter-spacing: 0.05em;
		border-bottom: 2px solid var(--border-color);
	}

	tr:last-child td {
		border-bottom: none;
	}

	    .actions-cell {
			display: flex;
			gap: 0.5rem;
		}

	    .section-header {
	        display: flex;
	        align-items: center;
	        gap: 1rem;
	        margin-bottom: 1rem;
	    }

	    .section-header h2 {
	        margin: 0;
			font-family: "Playfair Display", "Nanum Myeongjo", serif;
			font-size: 1.5rem;
			color: var(--text-primary);
	    }

	    .refresh-btn {
	        background: transparent;
	        border: none;
	        cursor: pointer;
	        font-size: 1.2rem;
	        display: flex;
	        align-items: center;
	        justify-content: center;
	        padding: 0.4rem;
	        border-radius: 4px;
	        transition: background 0.2s;
	        color: var(--text-secondary);
	    }

	    .refresh-btn:hover:not(:disabled) {
	        background: var(--btn-secondary);
	        color: var(--text-primary);
	    }

	    .refresh-btn:disabled {
	        opacity: 0.5;
	        cursor: not-allowed;
	    }

	    .refresh-icon {
	        display: inline-block;
	    }

	    .refresh-icon.spinning {
	        animation: spin 1s linear infinite;
	    }

	    @keyframes spin {
	        from { transform: rotate(0deg); }
	        to { transform: rotate(360deg); }
	    }

	    /* Carousel Styles */
    .carousel-container {
        display: flex;
        align-items: center;
        gap: 1rem;
        position: relative;
        padding: 1rem 0;
        width: 100%;
    }

    .carousel-viewport {
        flex: 1;
        overflow: hidden;
    }

    .carousel-track {
        display: flex;
        width: 100%; /* Track width matches viewport for easy percentage shifts */
        transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        padding: 0.5rem 0;
    }

    .carousel-card-wrapper {
        flex: 0 0 33.333333%; /* Strictly 1/3 of the viewport */
        padding: 0 1rem; /* Gap replacement */
        box-sizing: border-box;
    }

    .carousel-card {
        height: 100%;
        margin: 0 !important; /* Ensure card styling doesn't add external space */
    }

    .carousel-nav {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        width: 40px;
        height: 40px;
        border-radius: 4px; /* Square nav buttons */
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1.2rem;
        font-weight: bold;
        transition: all 0.2s;
        box-shadow: var(--shadow);
        user-select: none;
        z-index: 10;
        font-family: "Playfair Display", "Nanum Myeongjo", serif;
    }

    .carousel-nav:hover:not(:disabled) {
        background: var(--btn-secondary);
        transform: scale(1.05);
    }

    .carousel-nav:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .mb-2 {
        margin-bottom: 0.5rem;
    }

    .skeleton-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .skeleton-carousel {
        pointer-events: none;
    }

    @media (max-width: 1024px) {
        .carousel-grid {
            grid-template-columns: repeat(2, 1fr) !important;
        }
    }

    @media (max-width: 768px) {
        .carousel-grid {
            grid-template-columns: 1fr !important;
        }
    }

    /* Pagination Styles */
    .pagination {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 2rem;
    }

    .page-btn {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
        user-select: none;
        font-weight: 600;
    }

    .page-btn:hover:not(:disabled) {
        background: var(--btn-secondary);
    }

    .page-btn.active {
        background: var(--text-primary);
        color: var(--bg-primary);
        border-color: var(--text-primary);
    }

    .page-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
