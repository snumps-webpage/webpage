"""회원 활동 팝업 회귀 검사. 격리 memory 서버(start.sh)에서만 실행.

터미널 1: scripts/measure/start.sh
터미널 2: python3 scripts/measure/member-activity-popup.py
BASE로 포트 변경 가능. 테스트 서버의 합성 데이터를 초기화한다.
"""
import datetime
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('BASE', 'http://127.0.0.1:5199').rstrip('/')
assert urlparse(BASE).hostname in ('127.0.0.1', 'localhost'), 'Local measurement server only'
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9)))
term_year = now.year if now.month >= 3 else now.year - 1
term = f'{term_year % 100:02d}-' + ('1' if 3 <= now.month <= 8 else '2')
people = [('popup-member', '팝업테스트회원'), ('popup-empty', '기록없는회원')]
members = [dict(id=id, name=name, department='수리과학부', joinedAt='2024-03-01',
                status='regular', statusChangedAt=now.isoformat(), withdrawal=None,
                isAlumni=False, alumniRevoked=False, alumniRevocationReason=None,
                roles=[], isAdmin=False, publicContact=None, project=None,
                legacyMemberId=None, sourceRequestId=None) for id, name in people]
registrations = [dict(id='registration-'+id, memberId=id, term=term,
                      registeredAt=now.isoformat(), sourceRequestId=None) for id, _ in people]
activities = [dict(id='popup-activity', title='팝업 검증 참석 활동',
                   date=dict(start='2024-04-01T19:00:00+09:00', end=None), type='회식',
                   attendeeIds=['popup-member'], studyId=None, sourceRequestId=None)]
payload = dict(op='reset', tables=[dict(name=name, doc=dict(schemaVersion=1, rows=rows))
               for name, rows in [('members', members), ('registrations', registrations),
                                  ('activities', activities)]])
request = Request(BASE+'/api/__probe', data=json.dumps(payload).encode(),
                  headers={'content-type': 'application/json',
                           'x-probe': os.environ.get('MEASURE_PROBE_TOKEN', 'probe-token')})
with urlopen(request) as response:
    assert response.status == 200

checks = []
errors = []
Path('.tmp').mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text)
            if message.type in ('warning', 'error') else None)
    page.goto(BASE+'/members', wait_until='networkidle')
    search = page.get_by_role('searchbox', name='명단 검색')
    search.fill('팝업테스트회원')
    link = page.get_by_role('link', name='팝업테스트회원', exact=True).filter(visible=True)
    pending = []
    pattern = '**/members/popup-member/__data.json*'
    page.route(pattern, lambda route: pending.append(route))
    link.click()
    dialog = page.get_by_role('dialog', name='팝업테스트회원 · 활동 기록')
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role('status')).to_contain_text('불러오는 중')
    expect(dialog.get_by_role('button', name='닫기', exact=True)).to_be_focused()
    page.wait_for_function('document.querySelector("dialog") !== null')
    assert pending, 'Detail request must be delayed by the test'
    pending[0].continue_()
    expect(dialog).to_contain_text('팝업 검증 참석 활동')
    expect(dialog).to_contain_text('전체 1')
    expect(dialog).to_contain_text('주최한 세미나 기록이 없습니다')
    expect(dialog).to_contain_text('주최한 스터디 기록이 없습니다')
    assert page.url == BASE+'/members'
    page.unroute(pattern)
    page.screenshot(path='.tmp/member-activity-popup-desktop.png', full_page=True)
    page.keyboard.press('Escape')
    expect(page.locator('dialog')).to_have_count(0)
    expect(search).to_have_value('팝업테스트회원')
    expect(link).to_be_focused()
    checks.append('desktop: lazy load, activity summary, Escape, focus restoration, search preserved')
    page.keyboard.press('Enter')
    expect(page.get_by_role('dialog')).to_contain_text('팝업 검증 참석 활동')
    page.get_by_role('button', name='닫기', exact=True).click()
    checks.append('keyboard Enter opens; close button dismisses')
    expect(page.locator('dialog')).to_have_count(0)
    link.click(modifiers=['Control'])
    expect(page.locator('dialog')).to_have_count(0)
    assert link.get_attribute('href') == '/members/popup-member'
    assert page.url == BASE+'/members'
    checks.append('Ctrl-click retains the original detail link without opening a dialog')
    page.goto(BASE+'/members/popup-member', wait_until='networkidle')
    expect(page.get_by_role('heading', name='팝업테스트회원', exact=True)).to_be_visible()
    expect(page.get_by_text('팝업 검증 참석 활동', exact=True)).to_be_visible()
    checks.append('existing standalone member URL retains activity content')
    page.close()

    mobile = browser.new_page(viewport={'width': 390, 'height': 844})
    mobile.on('pageerror', lambda error: errors.append(str(error)))
    mobile.goto(BASE+'/members', wait_until='networkidle')
    mobile.get_by_role('link', name='기록없는회원', exact=True).filter(visible=True).click()
    dialog = mobile.get_by_role('dialog')
    expect(dialog).to_contain_text('참석한 활동 기록이 없습니다')
    expect(dialog).to_contain_text('전체 0')
    assert dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth')
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.screenshot(path='.tmp/member-activity-popup-mobile.png', full_page=True)
    mobile.get_by_role('button', name='닫기', exact=True).click()
    checks.append('mobile: name opens, empty history, no horizontal overflow')
    mobile.close()

    no_js = browser.new_context(java_script_enabled=False)
    fallback = no_js.new_page()
    fallback.goto(BASE+'/members', wait_until='networkidle')
    fallback.get_by_role('link', name='팝업테스트회원', exact=True).filter(visible=True).click()
    expect(fallback).to_have_url(BASE+'/members/popup-member')
    expect(fallback.get_by_text('팝업 검증 참석 활동', exact=True)).to_be_visible()
    checks.append('JavaScript-free link still opens the full member page')
    no_js.close()

    # Separate page avoids a previously successful SvelteKit preload cache.
    failure = browser.new_page()
    failure.on('pageerror', lambda error: errors.append(str(error)))
    failure.goto(BASE+'/members', wait_until='networkidle')
    failure.route(pattern, lambda route: route.abort())
    failure.get_by_role('link', name='팝업테스트회원', exact=True).filter(visible=True).click()
    expect(failure.get_by_role('alert')).to_contain_text('불러오지 못했습니다')
    failure.unroute(pattern)
    failure.get_by_role('button', name='다시 시도', exact=True).click()
    expect(failure.get_by_role('dialog')).to_contain_text('팝업 검증 참석 활동')
    checks.append('network failure shows retry; retry recovers real activity')
    failure.close()

    early = browser.new_page()
    early.on('pageerror', lambda error: errors.append(str(error)))
    early.goto(BASE+'/members', wait_until='networkidle')
    pending = []
    early.route(pattern, lambda route: pending.append(route))
    early.get_by_role('link', name='팝업테스트회원', exact=True).filter(visible=True).click()
    expect(early.get_by_role('dialog').get_by_role('status')).to_be_visible()
    early.keyboard.press('Escape')
    expect(early.locator('dialog')).to_have_count(0)
    assert pending
    pending[0].continue_()
    early.wait_for_load_state('networkidle')
    expect(early.locator('dialog')).to_have_count(0)
    early.get_by_role('link', name='기록없는회원', exact=True).filter(visible=True).click()
    expect(early.get_by_role('dialog')).to_contain_text('참석한 활동 기록이 없습니다')
    expect(early.get_by_role('dialog')).not_to_contain_text('팝업 검증 참석 활동')
    checks.append('closing pending request does not reopen or leak prior member content')
    browser.close()

print(json.dumps(dict(checks=checks, unexpected_errors=errors), ensure_ascii=False, indent=2))
assert not errors, errors
