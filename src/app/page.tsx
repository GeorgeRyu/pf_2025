import styles from './page.module.scss'
import { client } from '@/libs/client'

type dataType = {
  contents: contentsType[]
  totalCount: number
  offset: number
  limit: number
}
type contentsType = {
  id: string
  title: string
  picture: {
    url: string,
    height: number,
    width: number
  }
}

export default async function todo(){  
  //microCMSからデータを取得する処理
  const data: dataType = await client.get({
    endpoint: 'works', //microCMSで設定したもの
    // queries: { fields: 'title, id, picture' },
  })
  
  return(
    <>
      <div className="relative z-30">
        <header className='grid grid-cols-4 gap-[8px]'>
          <div className='col-span-2'>
            <h1 className=''>RYU<br/>TAKAHASHI</h1>
            <p className='mt-[1em]'>WEB DEVELOPER</p>
          </div>
          <div className="col-span-2">sound<span className=''>(off)</span><span>{`{ setting }`}</span></div>
        </header>
        <div className='grid grid-cols-4 gap-[8px] mt-[20px]'>
          <div className='relative col-span-2 col-start-3'>
            <h2 id='title-contents' className='on-hover'>Works</h2>
            <div className="absolute top-[40px] left-0">
              {data?.contents.map((value, index) => (
                <a href={`/${value.id}`} key={index} className="flex" data-pic={value.picture && value.picture.url}>{value.title}</a>
              ))}
            </div>
          </div>
        </div>

        <footer className='fixed left-0 bottom-0 grid grid-cols-2 grid-rows-3 gap-x-[8px] w-full px-6 pb-8'>
              <div className="btn-menu col-start-1 row-start-3 pt-[1em]">MENU</div>
              <div className="flex items-center gap-x-[2em] col-start-2 row-start-1">
                <a href="http://" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href="http://" target="_blank" rel="noopener noreferrer">X</a>
              </div>
              <a href="mailto:r.takahasii@gmail.com" className=" col-start-2 row-start-2">r.takahasii@gmail.com</a>
              <p className='mt-[1em] col-start-2 row-start-3'>{`{`} <span>scroll</span> {`}`}</p>
        </footer>
      </div>
    </>
  )
}