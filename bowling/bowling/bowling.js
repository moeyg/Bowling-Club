import * as THREE from '../build/three.module.js';
import { GLTFLoader } from '../jsm/loaders/GLTFLoader.js';

class App {
  constructor() {
    this._setupAmmo();
  }

  // Ammo.js 를 사용하여 물리 시뮬레이션 설정
  _setupAmmo() {
    // Ammo 라이브러리 로드
    Ammo().then(() => {
      // 물리 시뮬레이션을 위한 기본 구성 요소 설정
      const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration(),
        dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration),
        overlappingPairCache = new Ammo.btDbvtBroadphase(),
        solver = new Ammo.btSequentialImpulseConstraintSolver();

      // 물리 세계를 생성하고 구성 요소들을 설정
      // dispatcher: 충돌 이벤트 처리
      // overlappingPairCache: 충돌 이벤트를 최적화하기 위한 캐시 구조체
      // solver: 물체 간의 상호 작용을 계산하고 이를 해결하기 위한 제약 조건 관리
      // collisionConfiguration: 충돌 처리에 대한 기본 설정 제공
      const physicsWorld = new Ammo.btDiscreteDynamicsWorld(
        dispatcher,
        overlappingPairCache,
        solver,
        collisionConfiguration
      );

      // 중력 가속도(G = 9.8 m/s²) 설정
      // 좌표 체계에서 y축이 위를 향하도록 정의되어 있기 때문에 -9.8
      physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));

      // 생성된 물리 세계 저장
      this._physicsWorld = physicsWorld;
      // 강체들을 저장할 배열 초기화
      this._rigidBodies = [];
      // Three.js 와 Ammo.js 간의 위치와 회전에 대한 동기화를 위한 임시 객체
      this._tempTransform = new Ammo.btTransform();

      this._setupThreeJs();
      this._setupCamera();
      this._setupLight();
      this._setupModel();
      this._setupEvents();
    });
  }

  _setupThreeJs() {
    const bowling_game = document.querySelector('#bowling-game');
    this._bowling_game = bowling_game;

    // WebGLRender 생성
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // 렌더링 픽셀 비율을 현재 디바이스의 픽셀 비율로 설정
    renderer.setPixelRatio(window.devicePixelRatio);
    bowling_game.appendChild(renderer.domElement);
    // 렌더러의 출력 인코딩을 sRGB로 설정
    renderer.outputEncoding = THREE.sRGBEncoding;
    this._renderer = renderer;

    // Three.js의 씬 생성
    const scene = new THREE.Scene();
    this._scene = scene;
  }

  _setupCamera() {
    const camera = new THREE.PerspectiveCamera(
      75, // 시야각
      window.innerWidth / window.innerHeight, // 가로세로 비율
      0.1, // 가까운 클리핑 평면
      10 // 먼 클리핑 평면
    );
    // 카메라 위치 조정
    camera.position.set(0, 0.6, -3.0);
    // 카메라 시점 조정
    camera.lookAt(0, -2.0, 3.5);
    this._camera = camera;
  }

  _setupLight() {
    // 조명 색상
    const color = 0xffffff;
    // 주변광을 생성하고 씬에 추가
    const ambientLight = new THREE.AmbientLight(color, 0.1);
    // 정면에 조명 추가
    this._scene.add(ambientLight);

    // 방향광1을 생성하고 씬에 추가
    const directionLight1 = new THREE.DirectionalLight(color, 0.7);
    directionLight1.position.set(0, 2, -3.5);
    directionLight1.target.position.set(0, -0.5, 0.5);
    this._scene.add(directionLight1);

    // 방향광2를 생성하고 씬에 추가
    const directionLight2 = new THREE.DirectionalLight(color, 0.5);
    directionLight2.position.set(0, 1, 3);
    directionLight2.target.position.set(0, -0.5, 0.5);
    this._scene.add(directionLight2);
  }

  // GLTF 파일 로딩 함수
  _setupModel() {
    new GLTFLoader().load('./data/bowling.glb', (gltf) => {
      this._models = gltf.scene;
      this._createLane();
      this._createPins();
      this._createMovingBall();
    });
  }

  // 볼링 레인 생성 함수
  _createLane() {
    const models = this._models;
    // 3D 모델 중, Lane 불러오기
    const lane = models.getObjectByName('Lane');
    // Lane 의 현재 위치를 가져와서 저장
    const position = {
      x: lane.position.x,
      y: lane.position.y,
      z: lane.position.z,
    };
    // Lane 을 추가할 위치와 축 회전값 설정
    const quaternion = { x: 0, y: 0, z: 0, w: 1 };
    // 질량을 0으로 설정하여 강체가 움직이지 않도록 고정
    const mass = 0;

    // lane 을 씬에 추가
    lane.position.set(position.x, position.y, position.z);
    this._scene.add(lane);

    // 변환 객체를 생성하고 초기화
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
    transform.setRotation(
      new Ammo.btQuaternion(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      )
    );

    // 모션 상태 객체를 생성하고 초기화
    const motionState = new Ammo.btDefaultMotionState(transform);

    // 충돌 형태 객체를 Lane 에서 생성
    const colisionShape = this._createAmmoShapeFromObject(lane);
    // 여유 공간 0.01 안이면 충돌 처리
    colisionShape.setMargin(0.01);

    // 관성값 계산
    const inertia = new Ammo.btVector3(0, 0, 0);
    colisionShape.calculateLocalInertia(mass, inertia);

    // 강체 정보 생성
    const rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(
      mass,
      motionState,
      colisionShape,
      inertia
    );

    // 실제 강체 생성
    const realRigidBody = new Ammo.btRigidBody(rigidBodyInfo);
    realRigidBody.setFriction(0.5); // 마찰 계수
    realRigidBody.setRollingFriction(0.1); // 회전 마찰 계수
    realRigidBody.setRestitution(0.2); // 반발 계수
    // 강체를 물리 세계에 추가
    this._physicsWorld.addRigidBody(realRigidBody);
  }

  _createAmmoShapeFromObject(object) {
    // 벡터 객체 생성
    const vectorA = new Ammo.btVector3(0, 0, 0);
    const vectorB = new Ammo.btVector3(0, 0, 0);
    const vectorC = new Ammo.btVector3(0, 0, 0);

    // Convex Hull 형태의 충돌 형태 객체 생성
    const shape = new Ammo.btConvexHullShape();

    object.traverse((child) => {
      if (child.isMesh) {
        // 정점 정보 처리
        const vertexPosision = child.geometry.getAttribute('position').array;
        const triangles = [];

        // 정점을 삼각형으로 구성하여 배열에 추가
        for (let i = 0; i < vertexPosision.length; i += 3) {
          triangles.push({
            x: vertexPosision[i],
            y: vertexPosision[i + 1],
            z: vertexPosision[i + 2],
          });
        }

        // 삼각형을 Convex Hull 형태에 추가
        for (let i = 0; i < triangles.length - 3; i += 3) {
          vectorA.setX(triangles[i].x);
          vectorA.setY(triangles[i].y);
          vectorA.setZ(triangles[i].z);
          shape.addPoint(vectorA, true);

          vectorB.setX(triangles[i + 1].x);
          vectorB.setY(triangles[i + 1].y);
          vectorB.setZ(triangles[i + 1].z);
          shape.addPoint(vectorB, true);

          vectorC.setX(triangles[i + 2].x);
          vectorC.setY(triangles[i + 2].y);
          vectorC.setZ(triangles[i + 2].z);
          shape.addPoint(vectorC, true);
        }
      }
    });

    // 벡터 객체 해제
    Ammo.destroy(vectorA);
    Ammo.destroy(vectorB);
    Ammo.destroy(vectorC);

    // 생성된 Convex Hull 형태의 충돌 형태 객체 반환
    return shape;
  }

  _createMovingBall() {
    const models = this._models;
    // 공의 초기 위치 설정
    const position = { x: 0, y: 0.2, z: -2.4 };
    // 3D 모델 중, Ball 불러오기
    const ball = models.getObjectByName('Ball');
    this._ball = ball;

    // 공의 위치를 초기 위치로 설정하고 씬에 추가
    ball.position.set(position.x, position.y, position.z);
    this._scene.add(ball);

    // gsap 라이브러리를 사용하여 공의 위치를 애니메이션화
    gsap.fromTo(
      ball.position,
      { x: 0.5 }, // 시작 위치
      {
        x: -0.5, // 종료 위치
        duration: 1.5, // 애니메이션 지속 시간
        yoyo: true, // 애니메이션 왕복 시간
        repeat: -1, // 반복 횟수 (-1: 무한 반복)
        ease: 'power2.inOut',
      }
    );
  }

  _createPins() {
    const models = this._models;

    // 3D 모델 중 Pin 불러오기
    const pin = models.getObjectByName('Pin');
    // Pin 을 추가할 위치와 회전값 설정
    const quaternion = { x: 0, y: 0, z: 0, w: 1 };
    // 질량을 1로 설정하여 중력의 법칙과 충돌로 유동
    const mass = 1;

    // 충돌 형태 객체를 Pin 에서 생성
    const colisionShape = this._createAmmoShapeFromObject(pin);
    colisionShape.setMargin(0.01);

    // 관성값 계산
    const inertia = new Ammo.btVector3(0, 0, 0);
    colisionShape.calculateLocalInertia(mass, inertia);

    // 생성할 위치만큼 반복문
    for (let i = 0; i < 10; i++) {
      const pin_name = `Pin_Pos_${i + 1}`;
      const objects = pin.clone();
      objects.name = pin_name;

      // 각 핀의 초기 위치 설정
      const pin_positions = models.getObjectByName(pin_name);
      const position = {
        x: pin_positions.position.x,
        y: pin_positions.position.y + 0.2,
        z: pin_positions.position.z,
      };
      objects.position.copy(position);
      this._scene.add(objects);

      // 변환 객체를 생성하고 초기화
      const transform = new Ammo.btTransform();
      transform.setIdentity();
      transform.setOrigin(
        new Ammo.btVector3(position.x, position.y, position.z)
      );
      transform.setRotation(
        new Ammo.btQuaternion(
          quaternion.x,
          quaternion.y,
          quaternion.z,
          quaternion.w
        )
      );
      const motionState = new Ammo.btDefaultMotionState(transform);

      // 강체 정보 객체를 생성하고 초기화
      const rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(
        mass,
        motionState,
        colisionShape,
        inertia
      );
      const realRigidBody = new Ammo.btRigidBody(rigidBodyInfo);

      // 실제 강체의 마찰 계수, 회전 마찰 계수, 반발 계수 설정
      realRigidBody.setFriction(0.4);
      realRigidBody.setRollingFriction(0.1);
      realRigidBody.setRestitution(1);

      // 강체를 물리 세계에 추가
      this._physicsWorld.addRigidBody(realRigidBody);
      // 생성된 강체와 Three.js 모델을 연결하여 배열에 추가
      objects.userData.physicsBody = realRigidBody;
      this._rigidBodies.push(objects);
    }
  }

  _updatePhysics(deltaTime) {
    // 물리 세계에 대해 시간차(deltaTime)만큼 10단계로 시뮬레이션
    this._physicsWorld.stepSimulation(deltaTime, 10);

    // 각 물리 객체에 대해 업데이트 작업 수행
    for (let i = 0; i < this._rigidBodies.length; i++) {
      // Three.js 물체
      const threeObject = this._rigidBodies[i];
      // Ammo.js 물리 객체
      const ammoObject = threeObject.userData.physicsBody;
      // 물체의 움직임 상태 기록
      const motionState = ammoObject.getMotionState();

      if (motionState) {
        // 현재 물체의 위치와 회전을 Ammo.js에서 가져온 값으로 업데이트
        motionState.getWorldTransform(this._tempTransform);
        const position = this._tempTransform.getOrigin();
        const quaternion = this._tempTransform.getRotation();
        threeObject.position.set(position.x(), position.y(), position.z());
        threeObject.quaternion.set(
          quaternion.x(),
          quaternion.y(),
          quaternion.z(),
          quaternion.w()
        );
      }
    }
  }

  _setupEvents() {
    // 창 크기 조절 시 resize 함수 호출 이벤트 리스너 설정
    window.onresize = this.resize.bind(this);
    // 초기 리사이징 수행
    this.resize();

    // 마우스 이벤트와 관련된 변수 초기화
    this._mouseY = 0;
    this._prevMouseY = 0;

    // 마우스 이동 이벤트 리스너 추가
    window.addEventListener('mousemove', (event) => {
      this._prevMouseY = this._mouseY;
      this._mouseY = event.clientY;
    });

    // 마우스 UP 이벤트 리스너 추가
    window.addEventListener('mouseup', () => {
      // 마우스 드래그로부터 힘 계산
      const power = this._prevMouseY - this._mouseY;
      // 힘이 일정 수준 이상일 경우 동작
      if (power < 1) return;

      // 현재 공의 위치를 가져와서 저장
      const position = {
        x: this._ball.position.x,
        y: this._ball.position.y,
        z: this._ball.position.z,
      };

      // 이전에 있는 공을 씬에서 제거
      this._scene.remove(this._ball);
      // 새로운 공을 생성하는 함수 호출
      this._createBall(position, power / 30);
    });

    document.querySelector('#retry').addEventListener('click', () => {
      let countPins = 0;
      // 쓰러진 핀의 개수 초기화
      let countFallenPins = 0;

      // 모든 핀을 순회하면서 상태 확인
      for (let i = 0; i < 10; i++) {
        const pin_positions = `Pin_Pos_${i + 1}`;
        const pin = this._scene.getObjectByName(pin_positions);

        if (pin) {
          countPins++;
          // 핀이 쓰러진 경우
          if (pin.position.y < 0) {
            countFallenPins++;
            // 쓰러진 핀을 씬에서 제거하고 물리 세계에서도 제거
            this._scene.remove(pin);
            this._physicsWorld.removeRigidBody(pin.userData.physicsBody);
          }
        }
      }

      // 모든 핀이 쓰러졌을 경우 다시 핀 생성
      if (countFallenPins === countPins) this._createPins();

      // 씬에 공을 다시 추가
      this._scene.add(this._ball);
      this._showRetryButton(false);
    });

    this._clock = new THREE.Clock();
    requestAnimationFrame(this.render.bind(this));
  }

  _createBall(position, power) {
    // Ball 을 추가할 축 회전값 설정
    const quaternion = { x: 0, y: 0, z: 0, w: 1 };
    // 질량을 3으로 하여 Pin 보다 무겁게 설정
    const mass = 3;
    const ball = this._ball.clone();
    // Ball 을 씬에 추가
    ball.position.set(position.x, position.y, position.z);
    this._scene.add(ball);

    // 변환 객체를 생성하고 초기화
    const transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(position.x, position.y, position.z));
    transform.setRotation(
      new Ammo.btQuaternion(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      )
    );

    // 모션 상태 객체를 생성하고 초기화
    const motionState = new Ammo.btDefaultMotionState(transform);

    // 충돌 형태 객체를 Ball 에서 생성
    const colisionShape = this._createAmmoShapeFromObject(ball);
    // 여유 공간 0.01 안이면 충돌 처리
    colisionShape.setMargin(0.01);

    // 관성값 계산
    const inertia = new Ammo.btVector3(0, 0, 0);
    colisionShape.calculateLocalInertia(mass, inertia);

    // 강체 정보 생성
    const rigidBodyInfo = new Ammo.btRigidBodyConstructionInfo(
      mass,
      motionState,
      colisionShape,
      inertia
    );

    // 실제 강체 생성
    const realRigidBody = new Ammo.btRigidBody(rigidBodyInfo);
    this._physicsWorld.addRigidBody(realRigidBody);

    realRigidBody.setFriction(0.5);
    realRigidBody.setRollingFriction(0.05);
    realRigidBody.setRestitution(0.9);

    ball.userData.physicsBody = realRigidBody;
    this._rigidBodies.push(ball);

    // 강체에 적용되는 힘의 방향과 크기
    const force = new Ammo.btVector3(0, 0, power * 100);
    // 힘을 적용하는 위치: z축 방향
    const targetPosision = new Ammo.btVector3(0.2, 0.2, 0);
    realRigidBody.applyForce(force, targetPosision);

    // gsap 라이브러리를 사용하여 카메라의 위치를 애니메이션화
    gsap.to(this._camera.position, {
      delay: 1.5,
      duration: 3,
      z: 1,
      ease: 'power2.out',
      onComplete: () => {
        this._showRetryButton(true);
      },
    });
  }

  _showRetryButton(retry_show) {
    if (retry_show) {
      document.querySelector('#retry').classList.add('show');
    } else {
      document.querySelector('#retry').classList.remove('show');
      // Retry 버튼 클릭 시 카메라의 원래 위치로 이동
      gsap.to(this._camera.position, {
        delay: 0,
        duration: 1,
        z: -3.1,
        ease: 'power2.out',
      });
    }
  }

  update() {
    const delta = this._clock.getDelta();
    this._updatePhysics(delta);
  }

  render() {
    this._renderer.render(this._scene, this._camera);
    this.update();
    requestAnimationFrame(this.render.bind(this));
  }

  resize() {
    const width = this._bowling_game.clientWidth;
    const height = this._bowling_game.clientHeight;

    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(width, height);
  }
}

function bgm() {
  const volume = document.querySelector('#volume');
  const bgm = document.querySelector('#bgm');
  let isMuted = false;

  volume.addEventListener('click', (event) => {
    event.stopPropagation();

    isMuted = !isMuted;

    if (isMuted) {
      volume.src = 'data/mute.png';
      bgm.muted = true;
    } else {
      volume.src = 'data/volume.png';
      bgm.muted = false;
    }
  });
}

window.onload = function () {
  new App();
  bgm();
};
