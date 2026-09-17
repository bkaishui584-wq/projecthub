import base64
import os
import tempfile
import unittest

os.environ['DATA_DIR'] = tempfile.mkdtemp(prefix='projecthub-python-tests-')
os.environ['ADMIN_PASSWORD'] = 'AdminTestPass123!'
os.environ['NODE_ENV'] = 'test'

import app as projecthub


class ProjectHubApiTest(unittest.TestCase):
    def setUp(self):
        self.owner = projecthub.app.test_client()
        self.member = projecthub.app.test_client()

    def write(self, client, url, payload, csrf):
        return client.post(url, json=payload, headers={'X-CSRF-Token': csrf})

    def test_core_collaboration_flow(self):
        self.assertEqual(self.owner.get('/api/health').status_code, 200)
        response = self.owner.post('/api/register', json={'nickname': 'Python负责人', 'password': 'StrongPass123!', 'grade': '大一', 'directions': ['m1']})
        self.assertEqual(response.status_code, 200)
        owner_csrf = response.get_json()['csrf']
        response = self.write(self.owner, '/api/topics', {'title': 'Python协作测试', 'desc': '测试', 'vibe': '友好', 'directions': ['m1'], 'required': ['m1'], 'neededRoles': ['技术成员'], 'type': 'public', 'limit': 5}, owner_csrf)
        self.assertEqual(response.status_code, 200)
        topic_id = response.get_json()['topic']['id']

        response = self.member.post('/api/register', json={'nickname': 'Python成员', 'password': 'StrongPass123!', 'grade': '大一', 'directions': ['m1']})
        member_csrf = response.get_json()['csrf']
        response = self.write(self.member, f'/api/topics/{topic_id}/applications', {'message': '申请加入'}, member_csrf)
        self.assertEqual(response.status_code, 200)
        application_id = response.get_json()['application']['id']

        response = self.write(self.owner, f'/api/applications/{application_id}/approve', {}, owner_csrf)
        self.assertEqual(response.status_code, 200)
        response = self.write(self.member, f'/api/topics/{topic_id}/messages', {'text': '大家好', 'clientId': 'client-1'}, member_csrf)
        message_id = response.get_json()['message']['id']
        duplicate = self.write(self.member, f'/api/topics/{topic_id}/messages', {'text': '大家好', 'clientId': 'client-1'}, member_csrf)
        self.assertEqual(duplicate.get_json()['message']['id'], message_id)

        forbidden = self.owner.delete(f'/api/topics/{topic_id}/messages/{message_id}', headers={'X-CSRF-Token': owner_csrf})
        self.assertEqual(forbidden.status_code, 403)
        recalled = self.member.delete(f'/api/topics/{topic_id}/messages/{message_id}', headers={'X-CSRF-Token': member_csrf})
        self.assertEqual(recalled.status_code, 200)

        tiny_png = base64.b64encode(bytes([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])).decode('ascii')
        uploaded = self.write(self.member, f'/api/topics/{topic_id}/files', {'name': 'tiny.png', 'data': tiny_png}, member_csrf)
        self.assertEqual(uploaded.status_code, 200, uploaded.get_json())
        files = self.member.get(f'/api/topics/{topic_id}/files')
        self.assertEqual(files.status_code, 200)
        self.assertEqual(len(files.get_json()['files']), 1)

        enabled = self.write(self.owner, f'/api/topics/{topic_id}/ai/toggle', {'enabled': True}, owner_csrf)
        self.assertEqual(enabled.status_code, 200)
        thought = self.write(self.owner, f'/api/topics/{topic_id}/ai/think', {}, owner_csrf)
        self.assertEqual(thought.status_code, 200, thought.get_json())
        self.assertEqual(thought.get_json()['ai']['status'], 'voting')

    def test_csrf_and_duplicate_project(self):
        response = self.owner.post('/api/register', json={'nickname': '负责人二', 'password': 'StrongPass123!', 'grade': '大二', 'directions': ['m3']})
        csrf = response.get_json()['csrf']
        payload = {'title': '唯一项目', 'desc': '测试', 'vibe': '友好', 'directions': ['m3'], 'required': ['m3'], 'neededRoles': ['技术成员'], 'type': 'public', 'limit': 5}
        self.assertEqual(self.write(self.owner, '/api/topics', payload, csrf).status_code, 200)
        duplicate = self.write(self.owner, '/api/topics', payload, csrf)
        self.assertEqual(duplicate.status_code, 409)
        forged = self.owner.patch('/api/me', json={'grade': '大三'}, headers={'X-CSRF-Token': 'forged'})
        self.assertEqual(forged.status_code, 403)


if __name__ == '__main__':
    unittest.main()
