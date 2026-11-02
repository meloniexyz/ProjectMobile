/**
 * The parts of Jellyfin's API types that Negusify uses. Jellyfin sends PascalCase JSON and leaves
 * out fields that are null, so everything except the id is optional.
 */

export interface NameIdPair {
  Name: string
  Id: string
}

export interface MediaStreamDto {
  Type: string
  Codec?: string
  SampleRate?: number
  BitDepth?: number
  BitRate?: number
  Channels?: number
}

export interface MediaSourceDto {
  Id?: string
  Path?: string
  Container?: string
  Size?: number
  Bitrate?: number
  MediaStreams?: MediaStreamDto[]
}

export interface PersonDto {
  Name: string
  Id?: string
  Role?: string
  Type: string
  PrimaryImageTag?: string
}

export interface UserItemDataDto {
  IsFavorite?: boolean
  PlayCount?: number
  LastPlayedDate?: string
  Played?: boolean
}

export interface BaseItemDto {
  Id: string
  Name?: string
  /** 'Audio' | 'MusicAlbum' | 'MusicArtist' | 'Playlist' | 'Folder' | 'CollectionFolder' | 'Person' | ... */
  Type?: string
  CollectionType?: string
  IsFolder?: boolean
  ParentId?: string
  Path?: string
  Container?: string
  MediaType?: string
  RunTimeTicks?: number
  IndexNumber?: number
  ParentIndexNumber?: number
  ProductionYear?: number
  PremiereDate?: string
  DateCreated?: string
  Album?: string
  AlbumId?: string
  AlbumArtist?: string
  AlbumArtists?: NameIdPair[]
  Artists?: string[]
  ArtistItems?: NameIdPair[]
  AlbumPrimaryImageTag?: string
  ImageTags?: Record<string, string>
  ChildCount?: number
  SongCount?: number
  AlbumCount?: number
  Genres?: string[]
  People?: PersonDto[]
  /** dB to reach -18 LUFS (Jellyfin's audio normalization task) */
  NormalizationGain?: number
  MediaSources?: MediaSourceDto[]
  UserData?: UserItemDataDto
  /** entry id inside a playlist (removal works on these, not on item ids) */
  PlaylistItemId?: string
  Overview?: string
  SortName?: string
  ProviderIds?: Record<string, string>
  CanDelete?: boolean
}

export interface QueryResult<T> {
  Items: T[]
  TotalRecordCount: number
  StartIndex?: number
}

export interface UserDto {
  Id: string
  Name: string
  Policy?: { IsAdministrator?: boolean }
}
